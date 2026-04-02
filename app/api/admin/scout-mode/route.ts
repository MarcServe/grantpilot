import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin-auth";
import {
  getStoredScoutMode,
  scoutModeFromEnv,
  getEffectiveScoutMode,
  setScoutMode,
  clearScoutModeOverride,
  parseScoutMode,
  type ScoutMode,
} from "@/lib/worker-settings";

/**
 * GET /api/admin/scout-mode
 * Returns stored override (if any), env fallback, and effective mode used by the worker.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stored = await getStoredScoutMode();
  const envFallback = scoutModeFromEnv();
  const effective = await getEffectiveScoutMode();

  return NextResponse.json({
    stored,
    envFallback,
    effective,
    hasDatabaseOverride: stored !== null,
    description: {
      off: "Scout worker skips all grant link discovery jobs.",
      regex: "Playwright + regex/heuristics only — no Gemini (lowest API cost).",
      full: "Regex first, then Gemini Flash for vision/text when finding application URLs.",
    },
  });
}

/**
 * POST /api/admin/scout-mode
 * Body: { mode: "off" | "regex" | "full" } or { clear: true } to use Fly.io SCOUT_MODE env only.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { mode?: string; clear?: boolean };
  try {
    body = (await request.json()) as { mode?: string; clear?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.clear === true) {
    await clearScoutModeOverride();
    const effective = await getEffectiveScoutMode();
    return NextResponse.json({
      ok: true,
      message: "Database override cleared. Worker will use SCOUT_MODE from environment.",
      effective,
      stored: null,
    });
  }

  const mode = parseScoutMode(body.mode);
  if (!mode) {
    return NextResponse.json(
      { error: 'Invalid mode. Use "off", "regex", or "full".' },
      { status: 400 }
    );
  }

  await setScoutMode(mode as ScoutMode);

  return NextResponse.json({
    ok: true,
    message: `Scout mode set to "${mode}". The worker picks this up within seconds.`,
    effective: mode,
    stored: mode,
  });
}
