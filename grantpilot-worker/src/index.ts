import "./instrument.js";
import * as Sentry from "@sentry/node";
import { createServer } from "http";

const HEALTH_PORT = Number(process.env.PORT) || 8080;

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", worker: true }));
});

// Listen first so Fly's proxy sees the app as reachable before any worker code loads.
// Worker code (processor, supabase, scout) is loaded only after listen; if it throws,
// we log and keep the server up so we don't exhaust restart attempts.
server.listen(HEALTH_PORT, () => {
  console.log(`[grantpilot-worker] health server listening on :${HEALTH_PORT}`);

  (async () => {
    let runLoop: () => Promise<void>;
    try {
      const processor = await import("./processor.js");
      runLoop = processor.runLoop;
    } catch (e) {
      console.error("[grantpilot-worker] Failed to load worker (check env/secrets):", e);
      Sentry.captureException(e);
      // Don't exit: keep health server up so Fly doesn't restart us repeatedly
      return;
    }

    console.log("[grantpilot-worker] starting worker loop...");

    async function startLoop(): Promise<void> {
      try {
        await runLoop();
      } catch (e) {
        console.error("[grantpilot-worker] runLoop error (will retry in 15s):", e);
        Sentry.captureException(e);
        setTimeout(startLoop, 15_000);
      }
    }
    startLoop();
  })();
});
