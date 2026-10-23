export const DEADLINE_EXPORT_DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
export function deadlineExportEnd(days: number, now = new Date()): Date {
  if (!(DEADLINE_EXPORT_DAY_OPTIONS as readonly number[]).includes(days)) throw new Error("Unsupported deadline window");
  return new Date(now.getTime() + days * 86400000);
}
