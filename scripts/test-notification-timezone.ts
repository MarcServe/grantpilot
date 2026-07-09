import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isEligibilityNotificationCatchUpTime,
  isEligibilityNotificationTime,
} from "../lib/timezone";

const london = "Europe/London";

assert.equal(
  isEligibilityNotificationTime(london, new Date("2026-07-09T06:30:00.000Z")),
  false,
  "07:30 London should be too early"
);
assert.equal(
  isEligibilityNotificationTime(london, new Date("2026-07-09T07:30:00.000Z")),
  true,
  "08:30 London should be the normal notification time"
);
assert.equal(
  isEligibilityNotificationTime(london, new Date("2026-07-09T09:30:00.000Z")),
  false,
  "the strict scoring-time predicate should remain limited to 08:00"
);
assert.equal(
  isEligibilityNotificationCatchUpTime(london, new Date("2026-07-09T09:30:00.000Z")),
  true,
  "10:30 London should catch up after a missed scheduler window"
);
assert.equal(
  isEligibilityNotificationCatchUpTime(london, new Date("2026-07-09T16:30:00.000Z")),
  true,
  "17:30 London should remain inside the same-day catch-up window"
);
assert.equal(
  isEligibilityNotificationCatchUpTime(london, new Date("2026-07-09T17:30:00.000Z")),
  false,
  "18:30 London should be too late for a proactive daily digest"
);

const safeguardSource = fs.readFileSync("inngest/daily-notification-safeguard.ts", "utf8");
assert.match(
  safeguardSource,
  /isEligibilityNotificationCatchUpTime\(timezone\)/,
  "daily digest workers should use the catch-up window"
);
assert.match(
  safeguardSource,
  /isEligibilityNotificationCatchUpTime\(org\.preferredTimezone/,
  "daily digest enqueue should use the catch-up window"
);

console.log("notification timezone tests passed");
