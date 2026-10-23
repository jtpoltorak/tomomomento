// Focus history for the Stats screen. Pure functions only, like timer.ts.
//
// History is one small entry per local day, kept on the device. A day with no
// finished focus sessions has no entry.

import { localDateKey, type Settings, type TimerState } from './timer';

export interface DayStats {
  pomodoros: number;
  focusMinutes: number;
  /** Taps on "I drifted" during focus. Absent until the first one. */
  drifts?: number;
  /** Energy check-ins, tallied by time of day. Absent until the first one. */
  energy?: Partial<Record<Daypart, EnergyTally>>;
}

/** How a focus session felt: 1 low, 2 okay, 3 great. */
export type Energy = 1 | 2 | 3;
export type Daypart = 'morning' | 'afternoon' | 'evening' | 'night';

export interface EnergyTally {
  /** Sum of the ratings, so the average is sum / count. */
  sum: number;
  count: number;
}

export const ENERGY_LABELS: Record<Energy, string> = { 1: 'Low', 2: 'Okay', 3: 'Great' };

export const DAYPARTS: readonly { id: Daypart; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'night', label: 'Night' },
];

/** A time of day needs this many check-ins before Stats says anything about it. */
export const MIN_ENERGY_RATINGS = 3;

export interface EnergyRow {
  id: Daypart;
  label: string;
  count: number;
  /** 1 to 3, or null with too few check-ins to say. */
  average: number | null;
}

/** Keyed by local date (YYYY-MM-DD). */
export type History = Record<string, DayStats>;

export interface Totals {
  pomodoros: number;
  focusMinutes: number;
}

export interface Summary {
  today: Totals;
  last7Days: Totals;
  thisMonth: Totals;
  allTime: Totals;
}

export interface Day {
  key: string;
  /** Local midnight. */
  date: Date;
  pomodoros: number;
  focusMinutes: number;
}

export interface HeatmapWeek {
  /** Short month name when this week starts a new month, for the label row. */
  month: string | null;
  /** Monday to Sunday. Days after today are null. */
  days: (Day | null)[];
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Adds one finished focus session to the day it finished on. */
export function recordPomodoro(history: History, finishedAt: number, minutes: number): History {
  const key = localDateKey(finishedAt);
  const day = history[key] ?? { pomodoros: 0, focusMinutes: 0 };
  return {
    ...history,
    [key]: { ...day, pomodoros: day.pomodoros + 1, focusMinutes: day.focusMinutes + minutes },
  };
}

/**
 * Adds extra focus time ("Keep going") to the day it finished on, without
 * another pomodoro. A day with no pomodoros yet isn't started for it.
 */
export function addFocusMinutes(history: History, finishedAt: number, minutes: number): History {
  const key = localDateKey(finishedAt);
  const day = history[key];
  if (!day) return history;
  return { ...history, [key]: { ...day, focusMinutes: day.focusMinutes + minutes } };
}

/** Morning 5 am to noon, afternoon to 5 pm, evening to 10 pm, night after that. */
export function daypartOf(at: number): Daypart {
  const hour = new Date(at).getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/** Adds a check-in for the focus session that ended at `at`, on the day it counted for. */
export function recordEnergy(history: History, at: number, level: Energy): History {
  const key = localDateKey(at);
  const day = history[key];
  if (!day || ![1, 2, 3].includes(level)) return history;
  const part = daypartOf(at);
  const tally = day.energy?.[part] ?? { sum: 0, count: 0 };
  const energy = { ...day.energy, [part]: { sum: tally.sum + level, count: tally.count + 1 } };
  return { ...history, [key]: { ...day, energy } };
}

/** Every check-in so far, by time of day. */
export function energyByDaypart(history: History): EnergyRow[] {
  return DAYPARTS.map(({ id, label }) => {
    let sum = 0;
    let count = 0;
    for (const day of Object.values(history)) {
      sum += day.energy?.[id]?.sum ?? 0;
      count += day.energy?.[id]?.count ?? 0;
    }
    return { id, label, count, average: count >= MIN_ENERGY_RATINGS ? sum / count : null };
  });
}

/** The time of day that clearly goes best, once at least two have enough check-ins. */
export function bestDaypart(rows: readonly EnergyRow[]): EnergyRow | null {
  const known = rows.filter((r) => r.average !== null);
  if (known.length < 2) return null;
  const sorted = [...known].sort((a, b) => b.average! - a.average!);
  return sorted[0].average! - sorted[1].average! >= 0.25 ? sorted[0] : null;
}

/** An average check-in in words. */
export function energyWord(average: number): string {
  return ENERGY_LABELS[Math.round(average) as Energy];
}

/**
 * History before this feature existed is just today's tally on the timer
 * state, so the first history carries that over instead of starting at zero.
 */
export function seedHistory(state: TimerState, settings: Settings): History {
  if (state.completedToday <= 0) return {};
  return {
    [state.todayKey]: {
      pomodoros: state.completedToday,
      focusMinutes: state.completedToday * settings.workMinutes,
    },
  };
}

function sanitizeEnergy(input: unknown): DayStats['energy'] {
  if (!input || typeof input !== 'object') return undefined;
  const out: NonNullable<DayStats['energy']> = {};
  for (const { id } of DAYPARTS) {
    const tally = (input as Record<string, unknown>)[id] as Partial<EnergyTally> | undefined;
    const count = Math.floor(Number(tally?.count));
    const sum = Number(tally?.sum);
    if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(sum)) continue;
    out[id] = { count, sum: Math.min(3 * count, Math.max(count, sum)) };
  }
  return Object.keys(out).length ? out : undefined;
}

/** Drops anything malformed, since storage can hold whatever an older version wrote. */
export function sanitizeHistory(input: unknown): History {
  const out: History = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!DATE_KEY.test(key) || !value || typeof value !== 'object') continue;
    const { pomodoros, focusMinutes } = value as Partial<DayStats>;
    const p = Math.floor(Number(pomodoros));
    const m = Math.floor(Number(focusMinutes));
    const d = Math.floor(Number((value as Partial<DayStats>).drifts));
    const drifts = Number.isFinite(d) && d > 0 ? d : 0;
    // A day counts once it has a pomodoro, or a drift noted before the first one finished.
    if (!(Number.isFinite(p) && p > 0) && !drifts) continue;
    out[key] = {
      pomodoros: Number.isFinite(p) && p > 0 ? p : 0,
      focusMinutes: Number.isFinite(m) && m > 0 ? m : 0,
    };
    if (drifts) out[key].drifts = drifts;
    const energy = sanitizeEnergy((value as Partial<DayStats>).energy);
    if (energy) out[key].energy = energy;
  }
  return out;
}

function startOfDay(now: number): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Steps by calendar days, so a daylight saving change can't skip or repeat one. */
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayAt(history: History, date: Date): Day {
  const key = localDateKey(date.getTime());
  const stats = history[key];
  return {
    key,
    date,
    pomodoros: stats?.pomodoros ?? 0,
    focusMinutes: stats?.focusMinutes ?? 0,
  };
}

function sum(history: History, keep: (key: string) => boolean): Totals {
  let pomodoros = 0;
  let focusMinutes = 0;
  for (const [key, day] of Object.entries(history)) {
    if (!keep(key)) continue;
    pomodoros += day.pomodoros;
    focusMinutes += day.focusMinutes;
  }
  return { pomodoros, focusMinutes };
}

export function summarize(history: History, now: number): Summary {
  const today = localDateKey(now);
  const weekStart = localDateKey(addDays(startOfDay(now), -6).getTime());
  const month = today.slice(0, 7);
  // Keys sort as dates, so plain string comparison picks the range.
  return {
    today: sum(history, (k) => k === today),
    last7Days: sum(history, (k) => k >= weekStart && k <= today),
    thisMonth: sum(history, (k) => k.startsWith(month) && k <= today),
    allTime: sum(history, () => true),
  };
}

/** The last `count` days, oldest first, ending today. */
export function lastDays(history: History, now: number, count: number): Day[] {
  const today = startOfDay(now);
  return Array.from({ length: count }, (_, i) => dayAt(history, addDays(today, i - count + 1)));
}

/** `weeks` columns, Monday to Sunday, with this week last. */
export function heatmap(history: History, now: number, weeks: number): HeatmapWeek[] {
  const today = startOfDay(now);
  const sinceMonday = (today.getDay() + 6) % 7;
  const firstMonday = addDays(today, -sinceMonday - (weeks - 1) * 7);
  const out: HeatmapWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const monday = addDays(firstMonday, w * 7);
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      return date > today ? null : dayAt(history, date);
    });
    // Label the first week that starts in a new month. The first column only
    // gets a label when the next one doesn't, so two labels never collide.
    const prev = addDays(monday, -7).getMonth();
    const next = addDays(monday, 7).getMonth();
    const starts = w === 0 ? next === monday.getMonth() : prev !== monday.getMonth();
    const month = starts ? monday.toLocaleDateString('en-US', { month: 'short' }) : null;
    out.push({ month, days });
  }
  return out;
}

/** 0 (none) to 4 (a big day), on a fixed scale so a color means the same thing every week. */
export function heatLevel(pomodoros: number): 0 | 1 | 2 | 3 | 4 {
  if (pomodoros <= 0) return 0;
  if (pomodoros <= 2) return 1;
  if (pomodoros <= 4) return 2;
  if (pomodoros <= 7) return 3;
  return 4;
}

/** Notes one "I drifted" on the day it happened. */
export function recordDrift(history: History, now: number): History {
  const key = localDateKey(now);
  const day = history[key] ?? { pomodoros: 0, focusMinutes: 0 };
  return { ...history, [key]: { ...day, drifts: (day.drifts ?? 0) + 1 } };
}

export interface DriftWeek {
  drifts: number;
  pomodoros: number;
}

/** Drifts and pomodoros this week and last, Monday to Sunday, to compare the two. */
export function driftWeeks(
  history: History,
  now: number,
): { thisWeek: DriftWeek; lastWeek: DriftWeek } {
  const today = startOfDay(now);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const week = (from: Date): DriftWeek => {
    let drifts = 0;
    let pomodoros = 0;
    for (let i = 0; i < 7; i++) {
      const day = history[localDateKey(addDays(from, i).getTime())];
      drifts += day?.drifts ?? 0;
      pomodoros += day?.pomodoros ?? 0;
    }
    return { drifts, pomodoros };
  };
  return { thisWeek: week(monday), lastWeek: week(addDays(monday, -7)) };
}

export interface LookBack {
  /** Local date (YYYY-MM-DD) of the Monday the current week started, which keys the card. */
  week: string;
  totals: Totals;
  /** The day of last week with the most pomodoros. */
  best: Day;
}

/** Last week, Monday to Sunday, once there's something in it to look back on. */
export function weekLookBack(history: History, now: number): LookBack | null {
  const today = startOfDay(now);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => dayAt(history, addDays(monday, i - 7)));
  const totals = days.reduce(
    (t, d) => ({
      pomodoros: t.pomodoros + d.pomodoros,
      focusMinutes: t.focusMinutes + d.focusMinutes,
    }),
    { pomodoros: 0, focusMinutes: 0 },
  );
  if (totals.pomodoros === 0) return null;
  const best = days.reduce((a, b) => (b.pomodoros > a.pomodoros ? b : a));
  return { week: localDateKey(monday.getTime()), totals, best };
}

/** "0m", "45m", "2h 5m", "3h". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** The focus garden: one plant per pomodoro, picked in turn so a day looks varied. */
export const GARDEN_PLANTS = ['🌱', '🌷', '🌿', '🌼', '🍀', '🌻'] as const;
/** Plants drawn per day; past that, the day shows "+N". */
export const GARDEN_MAX_PLANTS = 6;

export interface GardenDay {
  day: Day;
  plants: string[];
  /** Pomodoros past the drawn plants. */
  more: number;
}

/** This week, Monday to Sunday, with a plant for each pomodoro. Days after today are null. */
export function weekGarden(history: History, now: number): (GardenDay | null)[] {
  const today = startOfDay(now);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    if (date > today) return null;
    const day = dayAt(history, date);
    const shown = Math.min(day.pomodoros, GARDEN_MAX_PLANTS);
    // Start each weekday on a different plant, so the rows don't all match.
    const plants = Array.from(
      { length: shown },
      (_, p) => GARDEN_PLANTS[(i + p) % GARDEN_PLANTS.length],
    );
    return { day, plants, more: day.pomodoros - shown };
  });
}
