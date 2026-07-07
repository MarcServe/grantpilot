import assert from "node:assert/strict";
import { savedGrantSuppressesNotifications } from "../lib/grant-user-state";

assert.equal(savedGrantSuppressesNotifications({ status: "deferred", suppress_notifications: false }), true);
assert.equal(savedGrantSuppressesNotifications({ status: "applied", suppress_notifications: false }), true);
assert.equal(savedGrantSuppressesNotifications({ status: "dismissed", suppress_notifications: false }), true);
assert.equal(savedGrantSuppressesNotifications({ status: "saved", suppress_notifications: true }), true);
assert.equal(savedGrantSuppressesNotifications({ status: "viewed", suppress_notifications: true }), false);
assert.equal(savedGrantSuppressesNotifications({ status: "viewed", suppress_notifications: true }, { includeViewed: true }), true);
assert.equal(savedGrantSuppressesNotifications({ status: "viewed", suppress_notifications: false }, { includeViewed: true }), true);
assert.equal(savedGrantSuppressesNotifications({ status: "saved", suppress_notifications: false }), false);

console.log("grant user-state suppression tests passed");
