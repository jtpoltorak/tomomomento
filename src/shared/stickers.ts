// The sticker book: little rewards for gentle milestones. Worked out from the
// focus history each time, so there's nothing extra to store and nothing to
// lose. No streaks: every sticker, once earned, stays earned.

import type { History } from './stats';

export interface Sticker {
  id: string;
  emoji: string;
  name: string;
  /** How to earn it, shown under stickers not earned yet. */
  how: string;
}

interface Tally {
  pomodoros: number;
  focusMinutes: number;
  days: number;
  bestDay: number;
  weekendDays: number;
  drifts: number;
}

interface Rule extends Sticker {
  earned: (t: Tally) => boolean;
}

const RULES: readonly Rule[] = [
  {
    id: 'first',
    emoji: '🌱',
    name: 'First one',
    how: 'Finish a focus session',
    earned: (t) => t.pomodoros >= 1,
  },
  {
    id: 'p10',
    emoji: '⭐',
    name: 'Ten',
    how: 'Finish 10 pomodoros',
    earned: (t) => t.pomodoros >= 10,
  },
  {
    id: 'p25',
    emoji: '🌟',
    name: 'Twenty-five',
    how: 'Finish 25 pomodoros',
    earned: (t) => t.pomodoros >= 25,
  },
  {
    id: 'p50',
    emoji: '🏅',
    name: 'Fifty',
    how: 'Finish 50 pomodoros',
    earned: (t) => t.pomodoros >= 50,
  },
  {
    id: 'p100',
    emoji: '🏆',
    name: 'One hundred',
    how: 'Finish 100 pomodoros',
    earned: (t) => t.pomodoros >= 100,
  },
  {
    id: 'p250',
    emoji: '💎',
    name: 'Gem',
    how: 'Finish 250 pomodoros',
    earned: (t) => t.pomodoros >= 250,
  },
  {
    id: 'p500',
    emoji: '🚀',
    name: 'Liftoff',
    how: 'Finish 500 pomodoros',
    earned: (t) => t.pomodoros >= 500,
  },
  {
    id: 'big-day',
    emoji: '💪',
    name: 'Big day',
    how: 'Finish 8 in one day',
    earned: (t) => t.bestDay >= 8,
  },
  {
    id: 'days5',
    emoji: '📅',
    name: 'Five days',
    how: 'Focus on 5 different days',
    earned: (t) => t.days >= 5,
  },
  {
    id: 'days20',
    emoji: '🗓️',
    name: 'Twenty days',
    how: 'Focus on 20 different days',
    earned: (t) => t.days >= 20,
  },
  {
    id: 'hours10',
    emoji: '⏰',
    name: 'Ten hours',
    how: 'Focus for 10 hours in all',
    earned: (t) => t.focusMinutes >= 600,
  },
  {
    id: 'hours50',
    emoji: '🕰️',
    name: 'Fifty hours',
    how: 'Focus for 50 hours in all',
    earned: (t) => t.focusMinutes >= 3000,
  },
  {
    id: 'weekend',
    emoji: '🏖️',
    name: 'Weekend',
    how: 'Focus on a Saturday or Sunday',
    earned: (t) => t.weekendDays >= 1,
  },
  {
    id: 'noticed',
    emoji: '✨',
    name: 'Noticed',
    how: 'Tap "I drifted" once',
    earned: (t) => t.drifts >= 1,
  },
];

/** Every sticker, in book order. */
export const STICKERS: readonly Sticker[] = RULES.map(({ id, emoji, name, how }) => ({
  id,
  emoji,
  name,
  how,
}));

/** The ids of the stickers earned so far, in book order. */
export function earnedStickers(history: History): string[] {
  const t: Tally = {
    pomodoros: 0,
    focusMinutes: 0,
    days: 0,
    bestDay: 0,
    weekendDays: 0,
    drifts: 0,
  };
  for (const [key, day] of Object.entries(history)) {
    t.pomodoros += day.pomodoros;
    t.focusMinutes += day.focusMinutes;
    t.drifts += day.drifts ?? 0;
    if (day.pomodoros > 0) {
      t.days++;
      t.bestDay = Math.max(t.bestDay, day.pomodoros);
      // Keys are local dates, so build a local date to read the weekday.
      const [y, m, d] = key.split('-').map(Number);
      const weekday = new Date(y, m - 1, d).getDay();
      if (weekday === 0 || weekday === 6) t.weekendDays++;
    }
  }
  return RULES.filter((r) => r.earned(t)).map((r) => r.id);
}

/** The most recent sticker earned that hasn't been seen yet, if any. */
export function newSticker(earned: readonly string[], seen: readonly string[]): Sticker | null {
  const id = [...earned].reverse().find((e) => !seen.includes(e));
  return STICKERS.find((s) => s.id === id) ?? null;
}
