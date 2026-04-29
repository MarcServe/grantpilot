export function isPastGrantDeadline(deadline?: string | Date | null): boolean {
  if (!deadline) return false;
  const parsed = deadline instanceof Date ? new Date(deadline) : new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed < today;
}

export function isGrantLinkUsable(grant: {
  deadline?: string | Date | null;
  url_status?: string | null;
  urlStatus?: string | null;
}): boolean {
  const status = grant.url_status ?? grant.urlStatus ?? "unknown";
  if (status === "dead" || status === "expired") return false;
  return !isPastGrantDeadline(grant.deadline);
}
