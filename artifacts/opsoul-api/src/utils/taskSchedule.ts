/**
 * Task next-run resolver. Replaces the daily/weekly-only logic so operators
 * can run tasks hourly, every-N-minutes, every-N-hours, at a fixed clock
 * time daily, on a chosen weekday, or via a standard 5-field cron
 * expression.
 *
 * Inputs:
 *   - taskType: "hourly" | "daily" | "weekly" | "cron"
 *   - customSchedule: only consulted when taskType === "cron"; free-text
 *     pattern like "every 6 hours", "at 09:00 daily", "at 14:30 on monday",
 *     or a 5-field cron string ("0 9 * * 1-5").
 *
 * The function never throws — invalid expressions return null so the caller
 * can pause the task instead of crashing the cron loop.
 */

export type NamedSchedule = 'hourly' | 'daily' | 'weekly' | 'cron';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Next-run time for the named buckets — no clock-time alignment. */
function nextRunForNamed(taskType: string, from: Date): Date | null {
  const t = from.getTime();
  switch (taskType) {
    case 'hourly': return new Date(t + 60 * 60 * 1000);
    case 'daily':  return new Date(t + 24 * 60 * 60 * 1000);
    case 'weekly': return new Date(t + 7 * 24 * 60 * 60 * 1000);
    default:       return null;
  }
}

/** Try to match "every N minutes" / "every N hours". */
function parseEveryN(expr: string, from: Date): Date | null {
  const m = expr.match(/^every\s+(\d+)\s+(minute|minutes|hour|hours)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const unit = m[2].toLowerCase();
  const ms = unit.startsWith('minute') ? n * 60 * 1000 : n * 60 * 60 * 1000;
  if (unit.startsWith('minute') && n < 5) return null; // floor at 5 to keep the hourly cron sensible
  return new Date(from.getTime() + ms);
}

/** "at HH:MM daily" / "at H:MM daily". Returns next occurrence after `from`. */
function parseAtDaily(expr: string, from: Date): Date | null {
  const m = expr.match(/^at\s+(\d{1,2}):(\d{2})\s+daily$/i);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  const next = new Date(from);
  next.setUTCHours(h, min, 0, 0);
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** "at HH:MM on monday" — next occurrence of that weekday at that time. */
function parseAtOnWeekday(expr: string, from: Date): Date | null {
  const m = expr.match(/^at\s+(\d{1,2}):(\d{2})\s+on\s+(\w+)$/i);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const dayIdx = WEEKDAYS.indexOf(m[3].toLowerCase());
  if (h < 0 || h > 23 || min < 0 || min > 59 || dayIdx === -1) return null;

  const next = new Date(from);
  const currentDay = next.getUTCDay();
  let daysAhead = (dayIdx - currentDay + 7) % 7;
  next.setUTCHours(h, min, 0, 0);
  if (daysAhead === 0 && next.getTime() <= from.getTime()) daysAhead = 7;
  next.setUTCDate(next.getUTCDate() + daysAhead);
  return next;
}

/**
 * Minimal 5-field cron parser. Each field accepts `*`, an integer, `N-M`,
 * `*\/N`, or a comma-separated list. Iterates forward minute-by-minute up
 * to 366 days to find the next match — never throws on a bad expression.
 *
 * Fields: minute (0-59) hour (0-23) day-of-month (1-31) month (1-12)
 * day-of-week (0-6, Sunday=0).
 */
function parseCronExpression(expr: string, from: Date): Date | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const ranges = [
    [0, 59], // minute
    [0, 23], // hour
    [1, 31], // dom
    [1, 12], // month
    [0, 6],  // dow
  ] as const;

  const masks: Array<Set<number>> = [];
  for (let i = 0; i < 5; i++) {
    const [lo, hi] = ranges[i];
    const set = new Set<number>();
    const parts = fields[i].split(',');
    for (const part of parts) {
      if (part === '*') {
        for (let v = lo; v <= hi; v++) set.add(v);
        continue;
      }
      const stepM = part.match(/^\*\/(\d+)$/);
      if (stepM) {
        const step = parseInt(stepM[1], 10);
        if (!Number.isFinite(step) || step <= 0) return null;
        for (let v = lo; v <= hi; v += step) set.add(v);
        continue;
      }
      const rangeM = part.match(/^(\d+)-(\d+)$/);
      if (rangeM) {
        const a = parseInt(rangeM[1], 10);
        const b = parseInt(rangeM[2], 10);
        if (a < lo || b > hi || a > b) return null;
        for (let v = a; v <= b; v++) set.add(v);
        continue;
      }
      const single = parseInt(part, 10);
      if (!Number.isFinite(single) || single < lo || single > hi) return null;
      set.add(single);
    }
    if (set.size === 0) return null;
    masks.push(set);
  }

  // Step minute by minute from `from + 1 minute` for up to 366 days.
  const limit = 366 * 24 * 60;
  const cursor = new Date(from);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  for (let i = 0; i < limit; i++) {
    if (
      masks[0].has(cursor.getUTCMinutes()) &&
      masks[1].has(cursor.getUTCHours()) &&
      masks[2].has(cursor.getUTCDate()) &&
      masks[3].has(cursor.getUTCMonth() + 1) &&
      masks[4].has(cursor.getUTCDay())
    ) {
      return new Date(cursor);
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

/**
 * Resolve the next run time for a task. Handles the named buckets plus
 * arbitrary cron-like expressions in `customSchedule`. Returns null if no
 * valid pattern matches — caller should treat that as "task cannot fire"
 * and pause or warn rather than burying the issue.
 */
export function computeNextRunAt(
  taskType: string,
  customSchedule: string | null | undefined,
  from: Date,
): Date | null {
  const namedNext = nextRunForNamed(taskType, from);
  if (namedNext) return namedNext;

  if (taskType !== 'cron' || !customSchedule) return null;
  const expr = customSchedule.trim();

  return (
    parseEveryN(expr, from) ??
    parseAtDaily(expr, from) ??
    parseAtOnWeekday(expr, from) ??
    parseCronExpression(expr, from)
  );
}

/** Human-readable display of a schedule for UI/logs. */
export function describeSchedule(taskType: string, customSchedule: string | null | undefined): string {
  if (taskType === 'hourly') return 'Every hour';
  if (taskType === 'daily')  return 'Every day';
  if (taskType === 'weekly') return 'Every week';
  if (taskType === 'cron' && customSchedule) return customSchedule;
  return taskType;
}

/** Validation helper for routes — returns null if valid, error string otherwise. */
export function validateSchedule(taskType: string, customSchedule: string | null | undefined): string | null {
  if (['hourly', 'daily', 'weekly'].includes(taskType)) return null;
  if (taskType !== 'cron') return `Unknown taskType "${taskType}". Use hourly | daily | weekly | cron.`;
  if (!customSchedule) return 'cron schedules require a customSchedule expression.';
  const probe = computeNextRunAt(taskType, customSchedule, new Date());
  if (!probe) return `Schedule "${customSchedule}" did not match any supported pattern (every N minutes/hours, at HH:MM daily, at HH:MM on weekday, or a 5-field cron expression).`;
  // Sanity: probe must be in the future
  if (probe.getTime() <= Date.now()) return `Schedule "${customSchedule}" resolved to a past time.`;
  return null;
}

/** Minute used by `pad2` — kept exported for tests if needed later. */
export { pad2 };
