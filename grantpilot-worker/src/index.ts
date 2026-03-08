import { createServer } from "http";
import { runLoop } from "./processor.js";

const HEALTH_PORT = Number(process.env.PORT) || 8080;

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", worker: true }));
});

server.listen(HEALTH_PORT, () => {
  console.log(`[grantpilot-worker] health server listening on :${HEALTH_PORT}`);
});

console.log("[grantpilot-worker] starting worker loop...");

runLoop().catch((e) => {
  console.error("[grantpilot-worker] fatal error", e);
  process.exit(1);
});
