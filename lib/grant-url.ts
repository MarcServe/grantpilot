/**
 * Normalize a pasted grant / application URL so validation and storage match what users expect.
 * Many real links are copied without a scheme (e.g. www.find-government-grants.service.gov.uk/...).
 */
export function normalizeGrantApplicationUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
    candidate = `https://${trimmed.replace(/^\/+/, "")}`;
  }

  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.hostname.toLowerCase() === "www.forms.office.com") {
      u.hostname = "forms.office.com";
    }
    return u.href;
  } catch {
    return null;
  }
}
