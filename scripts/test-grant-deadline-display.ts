import assert from "node:assert/strict";
import { grantDeadlineDisplay } from "../lib/grant-deadline-display";
const now = Date.parse("2026-09-21T15:00:00Z");
assert.equal(grantDeadlineDisplay(null, now).urgent, false);
assert.equal(grantDeadlineDisplay("not a date", now).date, "Not confirmed");
assert.equal(
  grantDeadlineDisplay("2026-09-20", now).urgency,
  "Listed deadline passed",
);
assert.equal(
  grantDeadlineDisplay("2026-09-21", now).urgency,
  "Closes today — check cutoff",
);
assert.equal(grantDeadlineDisplay("2026-09-22", now).urgency, "1 day left");
assert.equal(grantDeadlineDisplay("2026-09-28", now).urgent, true);
assert.equal(grantDeadlineDisplay("2026-10-21", now).urgent, false);
console.log(
  "Deadline urgency: missing, invalid, expired, today and upcoming dates passed",
);
