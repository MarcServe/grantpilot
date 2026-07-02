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

function strongDigestItems(payload: NotificationPayload): DigestGrantItem[] {
  const seen = new Set<string>();
  const items = [
    ...(payload.grants ?? []),
    ...(payload.previousScanGrants ?? []).filter((item) => item.score >= 85),
  ];

  return items
    .filter((item) => {
      if (!item.grantId || seen.has(item.grantId)) return false;
      seen.add(item.grantId);
      return true;
    })
    .sort(sortDigestItems);
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
  const strongItems = strongDigestItems(payload);
  const strongCount = strongItems.length;
  const topNames = strongItems.slice(0, 3).map((item) => compactText(item.grantName, 70));
  const summary =
    strongCount > 0
      ? `${strongCount} strong ${strongCount === 1 ? "match" : "matches"}: ${topNames.join("; ")}${strongCount > topNames.length ? ` + ${strongCount - topNames.length} more` : ""}`
      : "Daily scan complete. Your GrantsCopilot opportunity page is up to date.";

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
