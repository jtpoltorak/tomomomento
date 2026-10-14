import type { Phase } from './timer';

// Short, screen-free things to do on a break. Each fits on one line under the
// clock, where "Take a breather" usually goes.

export const SHORT_BREAK_IDEAS: readonly string[] = [
  'Stand up and stretch',
  'Refill your water',
  'Look at something far away',
  'Roll your shoulders a few times',
  'Take five slow, deep breaths',
  'Walk to another room and back',
  'Shake out your hands and arms',
  'Rest your eyes for a minute',
  'Tidy one small thing nearby',
  'Do a few calf raises',
  'Look out a window',
  'Wash your hands with cool water',
];

export const LONG_BREAK_IDEAS: readonly string[] = [
  'Take a short walk outside',
  'Have a snack and some water',
  'Step outside for some fresh air',
  'Do some gentle stretches',
  'Make a cup of tea',
  'Water a plant',
  'Dance to a couple of songs',
  'Chat with someone nearby',
  'Lie down and rest your eyes',
  'Sit somewhere away from screens',
];

/**
 * The idea for this break. `seed` names the break (so reopening the popup
 * shows the same idea), and `offset` steps through the rest of the list when
 * someone asks for another one.
 */
export function breakIdea(phase: Phase, seed: string, offset = 0): string | null {
  if (phase === 'work') return null;
  const pool = phase === 'longBreak' ? LONG_BREAK_IDEAS : SHORT_BREAK_IDEAS;
  return pool[(hash(seed) + offset) % pool.length];
}

/** A small, stable string hash (FNV-1a). */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
