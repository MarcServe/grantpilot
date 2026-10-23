export function grantDeadlineDisplay(
  deadline: string | null | undefined,
  now = Date.now(),
) {
  const time = deadline ? Date.parse(deadline) : NaN;
  if (!Number.isFinite(time))
    return {
      date: "Not confirmed",
      urgency: "Check funder deadline",
      urgent: false,
    };
  const date = new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const days = Math.floor(time / 86400000) - Math.floor(now / 86400000);
  if (days < 0)
    return { date, urgency: "Listed deadline passed", urgent: false };
  if (days === 0)
    return { date, urgency: "Closes today — check cutoff", urgent: true };
  return {
    date,
    urgency: days === 1 ? "1 day left" : `${days} days left`,
    urgent: days <= 7,
  };
}
