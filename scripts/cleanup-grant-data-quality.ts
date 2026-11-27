/**
 * One-off grant data-quality cleanup. DRY RUN BY DEFAULT.
 *
 *   # 1. Plan (read-only): writes the plan and a readable summary, changes nothing.
 *   npx tsx scripts/cleanup-grant-data-quality.ts --plan-out plan.json --summary-out plan.md
 *
 *   # 2. Apply a reviewed plan (production write; needs the explicit env flag).
 *   CONFIRM_GRANT_CLEANUP=apply npx tsx scripts/cleanup-grant-data-quality.ts --apply plan.json --backup-out backup.json
 *
 *   # 3. Undo an applied plan from its backup.
 *   CONFIRM_GRANT_CLEANUP=rollback npx tsx scripts/cleanup-grant-data-quality.ts --rollback backup.json
 *
 * Apply only touches rows listed in the plan, one UPDATE per row by id, and only
 * when the row still has exactly the plan's "before" values (otherwise skipped
 * and reported). Nothing is deleted. See lib/grant-cleanup-plan.ts for the rules.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  buildGrantCleanupPlan,
  CLEANUP_COLUMNS,
  type CleanupAction,
  type CleanupGrantRow,
  type CleanupPlan,
  type CleanupValues,
} from "../lib/grant-cleanup-plan";
import { loadIfsCompetitionIndex } from "../lib/ifs-competitions";

const args = process.argv.slice(2);
const arg = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
const db = createClient(url, key, { auth: { persistSession: false } });

const SELECT = ["id", "name", "funder", "source", "createdAt", ...CLEANUP_COLUMNS].join(",");

async function loadGrants(): Promise<CleanupGrantRow[]> {
  const out: CleanupGrantRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("Grant").select(SELECT).order("createdAt", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as CleanupGrantRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 100);

function summarise(plan: CleanupPlan, apps: Map<string, number>): string {
  const counts = new Map<string, number>();
  for (const a of plan.actions) counts.set(`${a.action}:${a.reason}`, (counts.get(`${a.action}:${a.reason}`) ?? 0) + 1);
  const lines = [
    `# Grant cleanup plan (dry run, nothing written)`, "",
    `Generated ${plan.generatedAt}. ${plan.scopeRows} rows currently surfaceable; ${plan.actions.length} planned single-row updates. IFS index loaded: ${plan.ifsIndexLoaded}.`, "",
    `"retire" sets url_status = 'expired' (row hidden from lists and matches; reversible from the backup). Nothing is deleted.`, "",
    `| action | reason | rows |`, `|---|---|---|`,
    ...[...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k.split(":")[0]} | ${k.split(":")[1]} | ${n} |`), "",
  ];
  const withApps = plan.actions.filter((a) => a.action === "retire" && (apps.get(a.id) ?? 0) > 0);
  lines.push(`## Retired rows that have Applications (${withApps.length})`, "", `These users' applications stay linked to the retired row; review before applying.`, "");
  if (withApps.length) {
    lines.push(`| id | name | reason | applications |`, `|---|---|---|---|`);
    for (const a of withApps) lines.push(`| ${a.id} | ${cell(a.name)} | ${a.reason} | ${apps.get(a.id)} |`);
  }
  lines.push("", `## All actions`, "", `| action | reason | id | name | detail | change |`, `|---|---|---|---|---|---|`);
  for (const a of plan.actions) {
    const change = Object.keys(a.after).map((c) => `${c}: ${cell((a.before as Record<string, unknown>)[c])} → ${cell((a.after as Record<string, unknown>)[c])}`).join("; ");
    lines.push(`| ${a.action} | ${a.reason} | ${a.id} | ${cell(a.name)} | ${cell(a.detail)} | ${cell(change)} |`);
  }
  return lines.join("\n");
}

async function applicationCounts(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("Application").select("grantId").in("grantId", ids.slice(i, i + 200));
    if (error) throw new Error(`Application lookup failed: ${error.message}`);
    for (const r of (data ?? []) as Array<{ grantId: string }>) counts.set(r.grantId, (counts.get(r.grantId) ?? 0) + 1);
  }
  return counts;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (typeof a === "string" && typeof b === "string" && /^\d{4}-\d{2}-\d{2}/.test(a) && /^\d{4}-\d{2}-\d{2}/.test(b)) {
    return new Date(a).getTime() === new Date(b).getTime();
  }
  return a === b;
}

/** Write each row's `to` values, but only if it still holds `expect`. Returns what was written. */
async function writeRows(items: Array<{ id: string; expect: CleanupValues; to: CleanupValues }>) {
  const written: Array<{ id: string; before: CleanupValues; after: CleanupValues }> = [];
  const skipped: Array<{ id: string; why: string }> = [];
  for (const item of items) {
    const cols = Object.keys(item.expect);
    const { data, error } = await db.from("Grant").select(["id", ...cols].join(",")).eq("id", item.id).maybeSingle();
    if (error || !data) { skipped.push({ id: item.id, why: error?.message ?? "row not found" }); continue; }
    const row = data as unknown as Record<string, unknown>;
    const drift = cols.filter((c) => !sameValue(row[c], (item.expect as Record<string, unknown>)[c]));
    if (drift.length) { skipped.push({ id: item.id, why: `changed since plan: ${drift.join(", ")}` }); continue; }
    const { error: updateError } = await db.from("Grant").update(item.to).eq("id", item.id);
    if (updateError) { skipped.push({ id: item.id, why: updateError.message }); continue; }
    written.push({ id: item.id, before: item.expect, after: item.to });
  }
  return { written, skipped };
}

async function main() {
  const applyPath = arg("--apply");
  const rollbackPath = arg("--rollback");

  if (applyPath) {
    if (process.env.CONFIRM_GRANT_CLEANUP !== "apply") throw new Error("Refusing to write: set CONFIRM_GRANT_CLEANUP=apply");
    const backupOut = arg("--backup-out");
    if (!backupOut) throw new Error("--backup-out is required with --apply");
    const plan = JSON.parse(readFileSync(applyPath, "utf8")) as CleanupPlan;
    const { written, skipped } = await writeRows(plan.actions.map((a: CleanupAction) => ({ id: a.id, expect: a.before, to: a.after })));
    writeFileSync(backupOut, JSON.stringify({ appliedAt: new Date().toISOString(), plan: applyPath, written, skipped }, null, 2));
    console.log(`Applied ${written.length} of ${plan.actions.length}; skipped ${skipped.length}. Backup: ${backupOut}`);
    return;
  }

  if (rollbackPath) {
    if (process.env.CONFIRM_GRANT_CLEANUP !== "rollback") throw new Error("Refusing to write: set CONFIRM_GRANT_CLEANUP=rollback");
    const backup = JSON.parse(readFileSync(rollbackPath, "utf8")) as { written: Array<{ id: string; before: CleanupValues; after: CleanupValues }> };
    const { written, skipped } = await writeRows(backup.written.map((w) => ({ id: w.id, expect: w.after, to: w.before })));
    console.log(`Rolled back ${written.length} of ${backup.written.length}; skipped ${skipped.length}.`);
    for (const s of skipped) console.log(`  skipped ${s.id}: ${s.why}`);
    return;
  }

  // Dry run: read-only.
  const [rows, ifsIndex] = await Promise.all([loadGrants(), loadIfsCompetitionIndex()]);
  const plan = buildGrantCleanupPlan(rows, ifsIndex);
  const apps = await applicationCounts(plan.actions.filter((a) => a.action === "retire").map((a) => a.id));
  const planOut = arg("--plan-out") ?? "grant-cleanup-plan.json";
  writeFileSync(planOut, JSON.stringify(plan, null, 2));
  const summaryOut = arg("--summary-out");
  const summary = summarise(plan, apps);
  if (summaryOut) writeFileSync(summaryOut, summary);
  else console.log(summary);
  console.error(`DRY RUN: ${plan.actions.length} planned updates written to ${planOut}. Nothing was changed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
