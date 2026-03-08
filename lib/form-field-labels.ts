/**
 * Normalise form field labels for display so reviewers see readable names
 * instead of internal IDs (Cookiebot, HubSpot cm-*, UUIDs, etc.).
 */
export function normalizeFormFieldLabel(label: string, name: string): string {
  const raw = (label || name || "").trim();
  if (!raw) return "Form field";

  const lower = raw.toLowerCase();

  // Cookie consent / Cookiebot
  if (/cybotcookiebot|cookiebot/i.test(raw)) return "Cookie / consent";

  // HubSpot / marketing (cm-*)
  if (lower.startsWith("cm-")) {
    if (lower === "cm-name") return "Company name";
    if (lower.startsWith("cm-f-")) return "Form field";
    return "Form field";
  }

  // UUID (e.g. 3ab8d6a8-84cd-4d95-8540-9d76f48ba012)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return "Form field";
  }

  // Long internal-looking IDs (camelCase with no spaces)
  if (raw.length > 40 && !/\s/.test(raw) && /[A-Z]/.test(raw)) {
    return "Form field";
  }

  return raw;
}
