export type GrantFreshnessReason = "url_dead" | "url_expired" | "deadline_passed" | "programme_window_passed";

export interface GrantFreshnessStatus {
  usable: boolean;
  reason: GrantFreshnessReason | null;
  message: string | null;
  staleDate: Date | null;
}

interface GrantFreshnessInput {
  deadline?: string | Date | null;
  url_status?: string | null;
  urlStatus?: string | null;
  name?: string | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
}

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

interface TextDate {
  date: Date;
  label: string;
  index: number;
}

function startOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateValue(value?: string | Date | null): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function monthEnd(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex + 1, 0);
}

function parseTextDates(text: string): TextDate[] {
  const dates: TextDate[] = [];
  const seen = new Set<string>();

  const add = (date: Date, label: string, index: number) => {
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.toISOString()}|${index}|${label.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    dates.push({ date, label, index });
  };

  const dayMonthYear = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/gi;
  for (const match of text.matchAll(dayMonthYear)) {
    const day = Number(match[1]);
    const month = MONTH_INDEX[match[2].toLowerCase()];
    const year = Number(match[3]);
    if (month == null || day < 1 || day > 31) continue;
    add(new Date(year, month, day), match[0], match.index ?? 0);
  }

  const monthYear = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/gi;
  for (const match of text.matchAll(monthYear)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 6), match.index ?? 0);
    if (/\d{1,2}(?:st|nd|rd|th)?\s*$/i.test(before)) continue;
    const month = MONTH_INDEX[match[1].toLowerCase()];
    const year = Number(match[2]);
    if (month == null) continue;
    add(monthEnd(year, month), match[0], match.index ?? 0);
  }

  const isoDate = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
  for (const match of text.matchAll(isoDate)) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    add(new Date(year, month, day), match[0], match.index ?? 0);
  }

  return dates.sort((a, b) => a.index - b.index);
}

function sentenceWindowAround(text: string, index: number): string {
  const start = Math.max(
    text.lastIndexOf(".", index),
    text.lastIndexOf("\n", index),
    text.lastIndexOf(";", index)
  );
  const nextPeriod = text.indexOf(".", index);
  const nextBreak = text.indexOf("\n", index);
  const nextSemi = text.indexOf(";", index);
  const candidates = [nextPeriod, nextBreak, nextSemi].filter((value) => value >= 0);
  const end = candidates.length > 0 ? Math.min(...candidates) : text.length;
  return text.slice(Math.max(0, start + 1), end).trim();
}

function findProgrammeWindowPassed(grant: GrantFreshnessInput, now = new Date()): GrantFreshnessStatus | null {
  const text = [grant.name, grant.eligibility, grant.description, grant.objectives]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  const dates = parseTextDates(text);
  const today = startOfDay(now);

  for (const dateInfo of dates) {
    const sentence = sentenceWindowAround(lower, dateInfo.index);
    const mentionsProgramme = /\b(project|projects|programme|program|pilot|trial|contract|funded work|work must|activities)\b/.test(sentence);
    const startWindow = /\b(must|required|expected|need(?:s)?|will|should)\b.{0,60}\b(start|commence|begin)\b/.test(sentence)
      || /\b(start|commence|begin)\b.{0,25}\b(by|in|on|from)\b/.test(sentence);
    const endWindow = /\b(end|finish|complete|completion|deliver|close)\b.{0,40}\b(by|in|on|before|no later than)\b/.test(sentence)
      || /\b(by|before|no later than)\b.{0,40}\b(end|finish|complete|completion)\b/.test(sentence);
    const applicationDeadline = /\b(deadline|closing date|applications? close|apply by|submission deadline|submit by|closes)\b/.test(sentence);

    if (!mentionsProgramme && !applicationDeadline) continue;

    const sentenceDates = dates.filter((candidate) => {
      const distance = Math.abs(candidate.index - dateInfo.index);
      return distance <= Math.max(120, sentence.length + 20);
    });
    const latestDate = sentenceDates.reduce((latest, candidate) =>
      candidate.date > latest.date ? candidate : latest,
      dateInfo
    );
    const staleDate = startOfDay(latestDate.date);

    if (staleDate >= today) continue;

    if (applicationDeadline) {
      return {
        usable: false,
        reason: "deadline_passed",
        message: `This opportunity appears closed. The guidance mentions an application deadline around ${latestDate.label}.`,
        staleDate,
      };
    }

    if (mentionsProgramme && (endWindow || startWindow)) {
      return {
        usable: false,
        reason: "programme_window_passed",
        message: `This opportunity appears stale. The programme timing in the grant text has already passed (${latestDate.label}).`,
        staleDate,
      };
    }
  }

  return null;
}

export function isPastGrantDeadline(deadline?: string | Date | null, now = new Date()): boolean {
  const parsed = parseDateValue(deadline);
  if (!parsed) return false;
  return startOfDay(parsed) < startOfDay(now);
}

export function getGrantFreshnessStatus(grant: GrantFreshnessInput, now = new Date()): GrantFreshnessStatus {
  const status = grant.url_status ?? grant.urlStatus ?? "unknown";
  if (status === "dead") {
    return {
      usable: false,
      reason: "url_dead",
      message: "This grant link appears to be broken or removed.",
      staleDate: null,
    };
  }
  if (status === "expired") {
    return {
      usable: false,
      reason: "url_expired",
      message: "This grant programme appears to be closed.",
      staleDate: null,
    };
  }

  const parsedDeadline = parseDateValue(grant.deadline);
  if (parsedDeadline && isPastGrantDeadline(parsedDeadline, now)) {
    return {
      usable: false,
      reason: "deadline_passed",
      message: "This grant deadline has passed.",
      staleDate: startOfDay(parsedDeadline),
    };
  }

  const textWindow = findProgrammeWindowPassed(grant, now);
  if (textWindow) return textWindow;

  return {
    usable: true,
    reason: null,
    message: null,
    staleDate: null,
  };
}

export function isGrantLinkUsable(grant: GrantFreshnessInput): boolean {
  return getGrantFreshnessStatus(grant).usable;
}
