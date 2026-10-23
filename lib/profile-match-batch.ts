import type { EligibleGrant } from "@/components/grants/eligible-grant-card";
import type { EligibleMatchSection } from "@/lib/eligible-match-rules";
export const MATCH_WINDOW_SIZE = 80;
type Window = { scannedCount: number; sections: Record<EligibleMatchSection, EligibleGrant[]> };
export async function loadMatchBatch(tier: EligibleMatchSection, pageSize: number, cursor: string | null, loadWindow: (offset: number) => Promise<Window>) {
  let offset = 0, position = 0;
  if (cursor) {
    const parts = cursor.split(":").map(Number);
    if (parts.length !== 2 || parts.some((part) => !Number.isSafeInteger(part) || part < 0) || parts[0] % MATCH_WINDOW_SIZE !== 0 || parts[1] > MATCH_WINDOW_SIZE) throw new Error("Invalid batch cursor");
    [offset, position] = parts;
  }
  const grants: EligibleGrant[] = [];
  let hasMore = true;
  for (let batch = 0; batch < 2; batch++) {
    const window = await loadWindow(offset);
    const candidates = window.sections[tier];
    const remaining = candidates.slice(position);
    const take = Math.min(pageSize - grants.length, remaining.length);
    grants.push(...remaining.slice(0, take));
    position += take;
    if (position < candidates.length) break;
    if (window.scannedCount < MATCH_WINDOW_SIZE) { hasMore = false; break; }
    offset += MATCH_WINDOW_SIZE;
    position = 0;
    if (grants.length >= pageSize) break;
  }
  return { grants, hasMore, nextCursor: hasMore ? `${offset}:${position}` : null };
}
