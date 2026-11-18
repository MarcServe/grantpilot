import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceEnqueueLimit, sourceWorkerConcurrency } from "../lib/source-crawler-config";
assert.equal(sourceEnqueueLimit(undefined),50);assert.equal(sourceEnqueueLimit("10000"),100);assert.equal(sourceEnqueueLimit("-1"),50);assert.equal(sourceEnqueueLimit("bad"),50);assert.equal(sourceEnqueueLimit("10"),10);
assert.equal(sourceWorkerConcurrency(undefined),4);assert.equal(sourceWorkerConcurrency("999"),4);assert.equal(sourceWorkerConcurrency("2"),2);
const config=JSON.parse(readFileSync("vercel.json","utf8"));assert.equal(config.crons.find((c:{path:string})=>c.path==="/api/cron/grant-source-crawler").schedule,"0 * * * *");
const worker=readFileSync("inngest/grant-source-crawler.ts","utf8");assert.ok(worker.includes('key: "event.data.sourceDomain"'));assert.ok(worker.includes('{ cron: "30 * * * *" }'));
console.log("Hourly source schedules, bounded enqueue, override limits and global/per-domain worker concurrency passed.");
