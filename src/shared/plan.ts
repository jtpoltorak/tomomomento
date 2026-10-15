// "Plan my day": how many pomodoros you'd like to do today, and roughly when
// you'd be done. Pure functions only, like timer.ts.
//
// Only today's plan is kept. Yesterday's is overwritten, never archived, so an
// unfinished plan leaves no record anywhere.

import { remainingMs, type Phase, type Settings, type TimerState } from './timer';

export const MIN_PLAN = 1;
export const MAX_PLAN = 16;
export const DEFAULT_PLAN = 4;
export const MAX_LABEL_LENGTH = 40;

export interface DayPlan {
  /** Local date (YYYY-MM-DD) the plan is for. */
  date: string;
  pomodoros: number;
  /** Optional, one per planned pomodoro. An empty string means no label. */
  labels: string[];
}

export interface PlanData {
  /** The latest plan. Only counts on the day it was made for. */
  plan: DayPlan | null;
  /** The last number planned, so tomorrow's plan starts there. */
  lastCount: number;
  /** Local date the daily card was answered with "Not today". */
  skippedOn: string | null;
}

export const EMPTY_PLAN_DATA: PlanData = { plan: null, lastCount: DEFAULT_PLAN, skippedOn: null };

export interface PlanBlock {
  phase: Phase;
  ms: number;
}

export interface PlanSchedule {
  blocks: PlanBlock[];
  /** Epoch ms when the last planned pomodoro would end. */
  endsAt: number;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function clampPlan(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_PLAN, Math.max(MIN_PLAN, v)) : DEFAULT_PLAN;
}

/** Trims labels to the plan's length, and drops a list that's all blanks. */
export function cleanLabels(labels: readonly string[], pomodoros: number): string[] {
  const out = Array.from({ length: pomodoros }, (_, i) =>
    String(labels[i] ?? '')
      .trim()
      .slice(0, MAX_LABEL_LENGTH),
  );
  return out.some(Boolean) ? out : [];
}

/** Drops anything malformed, since storage can hold whatever an older version wrote. */
export function sanitizePlanData(input: unknown): PlanData {
  if (!input || typeof input !== 'object') return EMPTY_PLAN_DATA;
  const raw = input as Partial<Record<keyof PlanData, unknown>>;
  let plan: DayPlan | null = null;
  if (raw.plan && typeof raw.plan === 'object') {
    const p = raw.plan as Partial<Record<keyof DayPlan, unknown>>;
    if (typeof p.date === 'string' && DATE_KEY.test(p.date)) {
      const pomodoros = clampPlan(p.pomodoros);
      const labels = Array.isArray(p.labels) ? p.labels.map((l) => String(l ?? '')) : [];
      plan = { date: p.date, pomodoros, labels: cleanLabels(labels, pomodoros) };
    }
  }
  const skippedOn =
    typeof raw.skippedOn === 'string' && DATE_KEY.test(raw.skippedOn) ? raw.skippedOn : null;
  return {
    plan,
    lastCount: raw.lastCount === undefined ? DEFAULT_PLAN : clampPlan(raw.lastCount),
    skippedOn,
  };
}

/** The plan for `today`, or null when there isn't one (or it's from another day). */
export function planFor(data: PlanData, today: string): DayPlan | null {
  return data.plan?.date === today ? data.plan : null;
}

export function savePlan(
  data: PlanData,
  today: string,
  pomodoros: number,
  labels: readonly string[],
): PlanData {
  const count = clampPlan(pomodoros);
  return {
    ...data,
    plan: { date: today, pomodoros: count, labels: cleanLabels(labels, count) },
    lastCount: count,
  };
}

export function clearPlan(data: PlanData): PlanData {
  return { ...data, plan: null };
}

/**
 * The focus and break blocks left before `pomodoros` more focus sessions are
 * done, starting now. The current phase counts with whatever time it has
 * left, and long breaks fall where the timer would put them. Assumes no
 * pauses, so it's an estimate.
 */
export function planSchedule(
  pomodoros: number,
  state: TimerState,
  settings: Settings,
  now: number,
): PlanSchedule {
  const blocks: PlanBlock[] = [];
  const work = settings.workMinutes * 60_000;
  let left = Math.max(0, Math.floor(pomodoros));
  let inCycle = state.completedInCycle;

  const breakAfterWork = (): void => {
    inCycle++;
    if (left === 0) return;
    const long = inCycle >= settings.sessionsBeforeLongBreak;
    blocks.push(
      long
        ? { phase: 'longBreak', ms: settings.longBreakMinutes * 60_000 }
        : { phase: 'shortBreak', ms: settings.shortBreakMinutes * 60_000 },
    );
    if (long) inCycle = 0;
  };

  if (left > 0) {
    const current = remainingMs(state, now);
    if (state.phase === 'work' && state.extending) {
      // Extra time after a pomodoro that already counted, then the break it put off.
      blocks.push({ phase: 'work', ms: current });
      const long = inCycle >= settings.sessionsBeforeLongBreak;
      blocks.push(
        long
          ? { phase: 'longBreak', ms: settings.longBreakMinutes * 60_000 }
          : { phase: 'shortBreak', ms: settings.shortBreakMinutes * 60_000 },
      );
      if (long) inCycle = 0;
    } else if (state.phase === 'work') {
      blocks.push({ phase: 'work', ms: current });
      left--;
      breakAfterWork();
    } else {
      blocks.push({ phase: state.phase, ms: current });
      if (state.phase === 'longBreak') inCycle = 0;
    }
  }
  while (left > 0) {
    blocks.push({ phase: 'work', ms: work });
    left--;
    breakAfterWork();
  }
  return { blocks, endsAt: now + blocks.reduce((sum, b) => sum + b.ms, 0) };
}

/** "12:45 PM". */
export function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** True when `at` falls on a later local day than `now`. */
export function isAfterToday(at: number, now: number): boolean {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return at >= end.getTime();
}

/** The extra line for the focus-complete notification when it finishes today's plan. */
export function planDoneMessage(
  data: PlanData,
  settings: Settings,
  state: TimerState,
): string | null {
  if (!settings.planEnabled) return null;
  const plan = planFor(data, state.todayKey);
  if (!plan || state.completedToday !== plan.pomodoros) return null;
  return `${plan.pomodoros} of ${plan.pomodoros}. That's your plan for today.`;
}
