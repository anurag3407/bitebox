import type { OpeningHours } from "@startup/contracts";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAY_KEYS)[number];

export const BUSINESS_TIMEZONE = "Asia/Kolkata";

interface LocalClock {
  day: DayKey;
  minutes: number; // minutes since local midnight
}

function toLocalClock(at: Date, timeZone: string): LocalClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const weekday = parts.find((p) => p.type === "weekday")?.value.toLowerCase().slice(0, 3) as DayKey;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { day: weekday, minutes: hour * 60 + minute };
}

function parseHm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function formatHm(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${suffix}`;
}

function previousDay(day: DayKey): DayKey {
  const idx = DAY_KEYS.indexOf(day);
  return DAY_KEYS[(idx + 6) % 7]!;
}

export class OpeningHoursPolicy {
  /**
   * Whether the schedule is open at the given instant. A missing or empty schedule
   * means "always open" so that restaurants without configured hours keep working.
   * Ranges where close <= open wrap past midnight (e.g. 18:00-02:00).
   */
  static isOpenAt(hours: OpeningHours | null | undefined, at: Date, timeZone = BUSINESS_TIMEZONE): boolean {
    if (!hours || Object.keys(hours).length === 0) return true;
    const { day, minutes } = toLocalClock(at, timeZone);

    for (const [open, close] of hours[day] ?? []) {
      const o = parseHm(open);
      const c = parseHm(close);
      if (c > o ? minutes >= o && minutes < c : minutes >= o) return true;
    }

    // Overnight ranges that started yesterday
    for (const [open, close] of hours[previousDay(day)] ?? []) {
      const o = parseHm(open);
      const c = parseHm(close);
      if (c <= o && minutes < c) return true;
    }

    return false;
  }

  /**
   * Short hint for the next opening within the coming week, e.g. "Opens at 11:00 AM"
   * or "Opens tomorrow at 9:00 AM". Returns undefined when always open or never opens.
   */
  static nextOpeningText(hours: OpeningHours | null | undefined, at: Date, timeZone = BUSINESS_TIMEZONE): string | undefined {
    if (!hours || Object.keys(hours).length === 0) return undefined;
    const { day, minutes } = toLocalClock(at, timeZone);
    const startIdx = DAY_KEYS.indexOf(day);

    for (let offset = 0; offset < 7; offset++) {
      const key = DAY_KEYS[(startIdx + offset) % 7]!;
      const opens = (hours[key] ?? [])
        .map(([open]) => parseHm(open))
        .filter((o) => offset > 0 || o > minutes)
        .sort((a, b) => a - b);
      if (opens.length > 0) {
        const when = formatHm(opens[0]!);
        if (offset === 0) return `Opens at ${when}`;
        if (offset === 1) return `Opens tomorrow at ${when}`;
        return `Opens ${key.charAt(0).toUpperCase()}${key.slice(1)} at ${when}`;
      }
    }
    return undefined;
  }
}
