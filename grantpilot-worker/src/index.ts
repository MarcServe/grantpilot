import { runLoop } from "./processor.js";

console.log("[grantpilot-worker] starting worker loop...");

runLoop().catch((e) => {
  console.error("[grantpilot-worker] fatal error", e);
  process.exit(1);
});
