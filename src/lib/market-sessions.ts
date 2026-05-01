// US equity session boundaries in America/New_York time. We resolve "what
// hour/minute is it in NY" via Intl.DateTimeFormat instead of pulling in a
// timezone library — the trade-off is a few ms per call vs. one less dep.

export type SessionLabel = 'pre' | 'regular' | 'after' | 'overnight' | 'closed';

export type SessionBounds = {
  /** Unix seconds for the start of today's pre-market window (4:00 AM ET). */
  preOpen: number;
  /** Unix seconds for regular open (9:30 AM ET). */
  regularOpen: number;
  /** Unix seconds for regular close (4:00 PM ET). */
  regularClose: number;
  /** Unix seconds for after-hours close (8:00 PM ET). */
  postClose: number;
  /** Whether "today" is a weekday in NY. */
  isWeekday: boolean;
};

// 4:00 AM, 9:30 AM, 4:00 PM, 8:00 PM as minute offsets from midnight ET.
const PRE_OPEN_MIN = 4 * 60;
const REGULAR_OPEN_MIN = 9 * 60 + 30;
const REGULAR_CLOSE_MIN = 16 * 60;
const POST_CLOSE_MIN = 20 * 60;

/**
 * Given any unix-seconds timestamp, classify it into a US equities session.
 * Weekends always return 'closed'. Outside 4 AM–8 PM on weekdays returns
 * 'overnight' so the chart can shade those hours distinctly from the
 * trading window.
 */
export function sessionAt(unixSec: number): SessionLabel {
  const d = new Date(unixSec * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const weekday = parts.find(p => p.type === 'weekday')?.value;
  let hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  if (hour === 24) hour = 0;
  const minutes = hour * 60 + minute;

  if (weekday === 'Sat' || weekday === 'Sun') return 'closed';
  if (minutes >= PRE_OPEN_MIN && minutes < REGULAR_OPEN_MIN) return 'pre';
  if (minutes >= REGULAR_OPEN_MIN && minutes < REGULAR_CLOSE_MIN) return 'regular';
  if (minutes >= REGULAR_CLOSE_MIN && minutes < POST_CLOSE_MIN) return 'after';
  return 'overnight';
}

export const SESSION_LABEL: Record<SessionLabel, string> = {
  pre: 'Pre-Market',
  regular: 'Market Hours',
  after: 'After-Hours',
  overnight: 'Overnight',
  closed: 'Closed',
};

/**
 * Resolve the four session-boundary timestamps for the ET calendar date that
 * `now` falls into. Used for chart axis bounds and reference bands. The
 * implementation walks back from `now` by computing the offset to ET midnight
 * via Intl, so it works around DST transitions without manual juggling.
 */
export function getTodaySessionBounds(now: Date = new Date()): SessionBounds {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const weekday = parts.find(p => p.type === 'weekday')?.value;
  let hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  const second = Number(parts.find(p => p.type === 'second')?.value ?? '0');
  if (hour === 24) hour = 0;

  // Seconds since ET midnight today.
  const secondsSinceMidnightET = hour * 3600 + minute * 60 + second;
  const nowSec = Math.floor(now.getTime() / 1000);
  const midnightET = nowSec - secondsSinceMidnightET;

  return {
    preOpen: midnightET + PRE_OPEN_MIN * 60,
    regularOpen: midnightET + REGULAR_OPEN_MIN * 60,
    regularClose: midnightET + REGULAR_CLOSE_MIN * 60,
    postClose: midnightET + POST_CLOSE_MIN * 60,
    isWeekday: weekday !== 'Sat' && weekday !== 'Sun',
  };
}

/**
 * Format a unix-seconds value as HH:MM in the user's locale. Used by chart
 * tooltips that have switched to a numeric `t` X-axis.
 */
export function formatTimeOfDay(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
