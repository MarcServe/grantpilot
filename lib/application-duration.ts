export function normaliseActualApplicationMinutes(value: unknown): number | null {
  const minutes = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null;
  if (!Number.isFinite(minutes)) return null;
  const rounded = Math.round(Number(minutes));
  if (rounded <= 0 || rounded > 24 * 60) return null;
  return rounded;
}

export function formatApplicationDuration(minutes: number | null | undefined): string | null {
  const safeMinutes = normaliseActualApplicationMinutes(minutes);
  if (!safeMinutes) return null;
  if (safeMinutes < 60) return `${safeMinutes} min`;
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}
