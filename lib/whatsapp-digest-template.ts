import type { DigestGrantItem, NotificationPayload } from "./notify";

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function digestItemTime(item: DigestGrantItem): number {
  const raw = item.grantAddedAt ?? item.scoredAt;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortDigestItems(a: DigestGrantItem, b: DigestGrantItem): number {
  const timeDelta = digestItemTime(b) - digestItemTime(a);
  if (timeDelta !== 0) return timeDelta;
  if (b.score !== a.score) return b.score - a.score;
  return a.grantName.localeCompare(b.grantName);
}

function dedupeStrongDigestItems(
  items: DigestGrantItem[] | undefined,
  excludedGrantIds = new Set<string>()
): DigestGrantItem[] {
  const seen = new Set<string>();

  return (items ?? [])
    .filter((item) => item.score >= 85)
    .filter((item) => {
      if (!item.grantId || seen.has(item.grantId) || excludedGrantIds.has(item.grantId)) return false;
      seen.add(item.grantId);
      return true;
    })
    .sort(sortDigestItems);
}

function summarizeItems(items: DigestGrantItem[], limit: number): string {
  const topNames = items.slice(0, limit).map((item) => compactText(item.grantName, 70));
  const extra = items.length > topNames.length ? ` + ${items.length - topNames.length} more` : "";
  return `${topNames.join("; ")}${extra}`;
}

export function buildDigestWhatsAppTemplateVariables(
  payload: NotificationPayload,
  appUrl: string
): {
  digestTemplateVariables: Record<string, string>;
  grantMatchTemplateVariables: Record<string, string>;
  strongCount: number;
} {
  const profileName = compactText(payload.profileName ?? "your business", 80);
  const matchesUrl = `${appUrl}/grants/eligible`;
  const freshItems = dedupeStrongDigestItems(payload.grants);
  const freshIds = new Set(freshItems.map((item) => item.grantId));
  const reminderItems = dedupeStrongDigestItems(payload.previousScanGrants, freshIds);
  const strongItems = [...freshItems, ...reminderItems];
  const strongCount = strongItems.length;
  let summary = "Daily scan complete. Your GrantsCopilot opportunity page is up to date.";

  if (freshItems.length > 0 && reminderItems.length > 0) {
    summary = `Fresh 85%+: ${summarizeItems(freshItems, 3)}. Still eligible reminders: ${summarizeItems(reminderItems, 3)}.`;
  } else if (freshItems.length > 0) {
    summary = `Fresh 85%+: ${summarizeItems(freshItems, 3)}.`;
  } else if (reminderItems.length > 0) {
    summary = `No new 85%+ today. Still eligible reminders: ${summarizeItems(reminderItems, 3)}.`;
  }

  const top = strongItems[0];
  const topLabel = top
    ? `${top.grantName}${strongCount > 1 ? ` + ${strongCount - 1} more` : ""}`
    : `${profileName} grant matches`;

  return {
    digestTemplateVariables: {
      "1": profileName,
      "2": compactText(summary, 450),
      "3": matchesUrl,
    },
    grantMatchTemplateVariables: {
      "1": top ? String(Math.round(Number(top.score))) : "85",
      "2": compactText(topLabel, 120),
      "3": matchesUrl,
    },
    strongCount,
  };
}
