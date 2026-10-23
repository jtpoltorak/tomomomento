import type { Settings } from './timer';

/**
 * Starter setups: one tap turns on a few options that work well together, so
 * nobody has to read every switch in Settings to get going. Each only changes
 * what it lists; everything else stays as it is.
 */
export interface Starter {
  id: 'gentle' | 'deep' | 'calm' | 'insight';
  label: string;
  blurb: string;
  changes: Partial<Settings>;
  /** The options it turns on, as Settings names them. */
  turnsOn: readonly string[];
}

export const STARTERS: readonly Starter[] = [
  {
    id: 'gentle',
    label: 'Gentle start',
    blurb: 'For days when starting is the hard part.',
    changes: { justStart: true, settleIn: true, firstStep: true, headsUp: true, smallWins: true },
    turnsOn: ['Just start', 'Settle in', 'First tiny step', 'Heads-up', 'Small wins'],
  },
  {
    id: 'deep',
    label: 'Deep work',
    blurb: 'Long, quiet stretches with room to keep going.',
    changes: {
      workMinutes: 50,
      shortBreakMinutes: 10,
      longBreakMinutes: 20,
      focusSound: 'brown',
      keepGoing: true,
      parkingLot: true,
      showEndsAt: true,
    },
    turnsOn: ['50/10 timers', 'Brown noise', 'Keep going', 'Parking lot', 'Ends at'],
  },
  {
    id: 'calm',
    label: 'Low stimulation',
    blurb: 'Less on screen, nothing moving.',
    changes: {
      minimalMode: true,
      calmClock: true,
      reduceMotion: true,
      lavaLamp: false,
      animateDigits: false,
      showQuotes: false,
    },
    turnsOn: ['Minimal timer', 'Calm clock', 'Reduce motion'],
  },
  {
    id: 'insight',
    label: 'Know yourself',
    blurb: 'Notice what helps, a little at a time.',
    changes: { dailyIntention: true, energyCheck: true, driftTally: true, weeklyLookBack: true },
    turnsOn: ['Daily intention', 'Energy check-in', 'Distraction tally', 'Weekly look-back'],
  },
];

/** True when every change the starter makes is already in place. */
export function starterIsOn(settings: Settings, starter: Starter): boolean {
  return Object.entries(starter.changes).every(
    ([key, value]) => settings[key as keyof Settings] === value,
  );
}
