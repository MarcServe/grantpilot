import { supabase } from "./supabase.js";
import { extractEmailFromUrl, processGrantApplicationStep } from "./claude.js";
const POLL_INTERVAL_MS = 5000;
const PROGRESS_UPDATE_EVERY = 5;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
export async function getNextRunnableSession() {
    const { data, error } = await supabase
        .from("cu_sessions")
        .select("*")
        .in("status", ["running", "resumed"])
        .order("started_at", { ascending: true })
        .limit(1);
    if (error)
        throw error;
    return data?.[0] ?? null;
}
async function getPendingItems(sessionId, limit = 50) {
    const { data, error } = await supabase
        .from("cu_session_items")
        .select("*")
        .eq("session_id", sessionId)
        .eq("status", "pending")
        .order("id", { ascending: true })
        .limit(limit);
    if (error)
        throw error;
    return (data ?? []);
}
async function markItemStatus(itemId, status, patch = {}) {
    const { error } = await supabase
        .from("cu_session_items")
        .update({ status, ...patch })
        .eq("id", itemId);
    if (error)
        throw error;
}
async function appendLog(sessionId, step, action, detail, success = true) {
    const { error } = await supabase.from("cu_session_logs").insert({
        session_id: sessionId,
        step,
        action,
        detail,
        success,
    });
    if (error)
        throw error;
}
async function updateSessionProgress(sessionId, processedItems, lastCheckpoint) {
    const patch = { processed_items: processedItems };
    if (lastCheckpoint)
        patch.last_checkpoint = lastCheckpoint;
    const { error } = await supabase
        .from("cu_sessions")
        .update(patch)
        .eq("id", sessionId);
    if (error)
        throw error;
}
async function completeSession(sessionId) {
    const { error } = await supabase
        .from("cu_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", sessionId);
    if (error)
        throw error;
}
async function failSession(sessionId, errorLog) {
    const { error } = await supabase
        .from("cu_sessions")
        .update({ status: "failed", error_log: errorLog })
        .eq("id", sessionId);
    if (error)
        throw error;
}
export async function processSession(session) {
    console.log(`[worker] Processing session ${session.public_id} (${session.task_type})`);
    await appendLog(session.id, "session_start", "start", `Processing session ${session.public_id} (${session.task_type})`, true);
    let processed = session.processed_items ?? 0;
    try {
        while (true) {
            const pending = await getPendingItems(session.id, 25);
            if (pending.length === 0)
                break;
            for (const item of pending) {
                try {
                    await markItemStatus(item.id, "processing");
                    await appendLog(session.id, "item_processing", "update", `Item ${item.id} -> processing`);
                    if (session.task_type === "csv_extraction") {
                        const url = item.url ?? "";
                        await appendLog(session.id, "extract_email", "navigate", url);
                        const result = await extractEmailFromUrl(url);
                        await markItemStatus(item.id, "done", {
                            email: result.email ?? null,
                            company_name: result.companyName ?? null,
                            extra_data: result.notes ? { notes: result.notes } : null,
                            processed_at: new Date().toISOString(),
                        });
                        await appendLog(session.id, "extract_email", "result", JSON.stringify({ url, email: result.email ?? null }));
                    }
                    else if (session.task_type === "grant_application") {
                        const result = await processGrantApplicationStep(item.action ?? "unknown", item.grant_name ?? "Unknown Grant", item.grant_url ?? "");
                        await markItemStatus(item.id, result.success ? "done" : "failed", {
                            extra_data: { notes: result.notes },
                            processed_at: new Date().toISOString(),
                        });
                        await appendLog(session.id, "grant_application", item.action ?? "step", result.notes, result.success);
                    }
                    else {
                        await appendLog(session.id, "unsupported_task", "skip", `Unsupported: ${session.task_type}`, false);
                        await markItemStatus(item.id, "skipped", {
                            error_message: `Unsupported task_type: ${session.task_type}`,
                        });
                    }
                    processed += 1;
                    if (processed % PROGRESS_UPDATE_EVERY === 0) {
                        await updateSessionProgress(session.id, processed, `processed_${processed}`);
                    }
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    console.error(`[worker] Item ${item.id} failed:`, msg);
                    await appendLog(session.id, "item_failed", "error", `Item ${item.id}: ${msg}`, false);
                    try {
                        await markItemStatus(item.id, "failed", {
                            error_message: msg,
                            processed_at: new Date().toISOString(),
                        });
                    }
                    catch { /* swallow */ }
                }
            }
        }
        await updateSessionProgress(session.id, processed, `final_${processed}`);
        await completeSession(session.id);
        await appendLog(session.id, "session_complete", "complete", `Completed ${session.public_id}`);
        console.log(`[worker] Session ${session.public_id} completed (${processed} items)`);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[worker] Session ${session.public_id} failed:`, msg);
        await failSession(session.id, msg).catch(() => { });
        await appendLog(session.id, "session_failed", "error", msg, false).catch(() => { });
    }
}
export async function runLoop() {
    console.log("[worker] Starting poll loop...");
    while (true) {
        try {
            const session = await getNextRunnableSession();
            if (!session) {
                await sleep(POLL_INTERVAL_MS);
                continue;
            }
            await processSession(session);
        }
        catch (err) {
            console.error("[worker] Loop error:", err);
            await sleep(2000);
        }
    }
}
