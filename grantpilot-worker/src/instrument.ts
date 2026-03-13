/**
 * Load this first so Sentry is initialized before any other application code.
 * Import from index.ts as: import "./instrument.js";
 */
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? "https://bb85406630f3ca5bb1013ee827ecd9d4@o4511032776130560.ingest.us.sentry.io/4511032776392704",
  sendDefaultPii: true,
});
