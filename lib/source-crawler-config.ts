/** Bound each enqueue while allowing the queue to drain throughout the day. */
export function sourceEnqueueLimit(value: string | undefined): number {
  const parsed=Number(value?.trim()||50);
  return Number.isFinite(parsed)&&parsed>0?Math.min(100,Math.max(1,Math.floor(parsed))):50;
}
export function sourceWorkerConcurrency(value: string | undefined): number {
  const parsed=Number(value?.trim()||4);
  return Number.isFinite(parsed)&&parsed>0?Math.min(4,Math.max(1,Math.floor(parsed))):4;
}
