// Pure timer logic shared by the background worker, popup, and options page.
// Nothing in this file touches `chrome.*`, so it can be unit tested in Node.

import { sanitizeSites } from './blocker';

export type Phase = 'work' | 'shortBreak' | 'longBreak';
export type Status = 'idle' | 'running' | 'paused';
export type SoundId = 'bell' | 'chime' | 'digital';
export type ThemeId = 'system' | 'light' | 'dark';
export type TextSizeId = 'normal' | 'large' | 'xlarge';
/** A quiet sound that plays during focus sessions, or 'off'. */
export type FocusSoundId = 'off' | 'tick' | 'brown' | 'rain' | 'waves';

export interface Settings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** Work sessions to finish before a long break replaces a short one. */
  sessionsBeforeLongBreak: number;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  sound: SoundId;
  /** 0 to 1. */
  volume: number;
  /** Redirect the sites below to a "stay focused" page during focus sessions. */
  blockSites: boolean;
  /** Bare domains, e.g. "youtube.com". Subdomains are blocked too. */
  blockedSites: string[];
  /** 'system' follows the device's light or dark mode. */
  theme: ThemeId;
  /** Show a short quote under the timer, one per phase. */
  showQuotes: boolean;
  /** "Plan my day": pick how many pomodoros to do today and track them under the timer. */
  planEnabled: boolean;
  /** Ask "What matters most today?" on the first open each day and keep the answer on the timer. */
  dailyIntention: boolean;
  /** With planning on, offer a card on the first open of each day. */
  planPrompt: boolean;
  /** The parking lot: jot stray thoughts during focus, look at them on a break. */
  parkingLot: boolean;
  /** In the evening, offer to sort the day's parked thoughts one by one. */
  dayWrapUp: boolean;
  /** On breaks, suggest something screen-free to do in place of "Take a breather". */
  breakIdeas: boolean;
  /** Offer a short "Just start" focus session for days when a full one feels like too much. */
  justStart: boolean;
  /** When focus ends, offer a few more minutes of it before the break. */
  keepGoing: boolean;
  /** A gentle cue a minute before a phase ends, so the switch isn't a surprise. */
  headsUp: boolean;
  /** Show whole minutes instead of a ticking minutes-and-seconds clock. */
  calmClock: boolean;
  /** A shrinking disc in place of the digits, so time left reads at a glance. */
  visualTimer: boolean;
  /** The toolbar icon becomes a ring that empties as the timer runs (extension only). */
  liveIcon: boolean;
  /** A button that fills the whole window with the clock, for reading across the room. */
  bigTimer: boolean;
  /** While the timer runs, show the time of day it ends ("Ends at 2:45 PM"). */
  showEndsAt: boolean;
  /** Each digit of the clock rolls in gently as it changes. */
  animateDigits: boolean;
  /** Just the clock, the progress bar and one button; the rest waits behind "Show more". */
  minimalMode: boolean;
  /** Soft colors drift slowly behind everything, like a lava lamp. */
  lavaLamp: boolean;
  /** A quiet reminder when the timer has sat paused for a while. */
  pauseNudge: boolean;
  /** Thirty seconds of slow breathing before a focus session's clock starts. */
  settleIn: boolean;
  /** While settling in, a circle that grows and shrinks with each breath shows in place of the clock. */
  breathCircle: boolean;
  /** Pause focus when the computer sits untouched, and ask on return (extension only). */
  awayCheck: boolean;
  /** Right-click selected text to park it, or a page to block its site (extension only). */
  rightClick: boolean;
  /** After every few focus sessions in a row, a break reminds you to look after yourself. */
  takeCare: boolean;
  /** A quick, quiet celebration when a focus session finishes. */
  smallWins: boolean;
  /** Stats grows a plant for each pomodoro this week, Monday to Sunday. */
  focusGarden: boolean;
  /** Pressing Start on a fresh focus session asks for the first tiny step first. */
  firstStep: boolean;
  /** When you pause focus or it ends, jot where you left off; it shows when you come back. */
  whereWasI: boolean;
  /** A quiet notice on the hour, from 8 am to 9 pm, even with no timer running. */
  timeCheck: boolean;
  /** After a focus session, a one-tap "how was it?" that Stats turns into best times of day. */
  energyCheck: boolean;
  /** The first time you open the timer each week, a short card about last week. */
  weeklyLookBack: boolean;
  /** An "I drifted" link during focus, counted in Stats. */
  driftTally: boolean;
  /** One-tap timer setups (Classic, Short, Deep) on the timer screen before you start. */
  rhythmPresets: boolean;
  /** A background sound while focus runs: soft ticking or brown noise. */
  focusSound: FocusSoundId;
  /** 0 to 1, separate from the alert volume. */
  focusVolume: number;
  /** Stronger text, edges and colors. */
  highContrast: boolean;
  /** Phase colors that stay distinct with every common kind of color blindness. */
  colorSafe: boolean;
  /** Scales all text (and the popup with it). */
  textSize: TextSizeId;
  /** Atkinson Hyperlegible Next, designed for low vision, instead of Rubik. */
  easyFont: boolean;
  /** No animations, even when the device doesn't ask for reduced motion. */
  reduceMotion: boolean;
  /** Single-key shortcuts on the timer screen: S skip, R restart, P park a thought, D drifted. */
  shortcuts: boolean;
}

export interface TimerState {
  phase: Phase;
  status: Status;
  /** Epoch ms when the current phase ends. Only meaningful while running. */
  endTime: number | null;
  /** Time left in the current phase. Authoritative while idle or paused. */
  remainingMs: number;
  /** Work sessions finished since the last long break. */
  completedInCycle: number;
  /** Work sessions finished today, for the popup's tally. */
  completedToday: number;
  /** Local date (YYYY-MM-DD) that `completedToday` belongs to. */
  todayKey: string;
  /**
   * The full length of this phase, only when it differs from Settings (a
   * "Just start" session). Absent otherwise, and in state saved by older versions.
   */
  phaseMs?: number;
  /** This focus phase is extra time after a finished one ("Keep going"), so it doesn't count again. */
  extending?: boolean;
  /** This break follows a focus session that ran out, so "Keep going" can be offered. */
  afterFocus?: boolean;
  /** Epoch ms the timer was paused, for the "still paused?" reminder. Only while paused. */
  pausedAt?: number;
  /**
   * Epoch ms the settle-in breathing ends and the focus clock starts. `endTime`
   * already includes it, so the phase ends at the right time with no extra step.
   */
  settleUntil?: number;
  /** Paused because you stepped away from the computer. `pausedAt` is when you left. */
  away?: boolean;
  /** Focus sessions finished one after another, with only breaks between them. */
  inARow?: number;
  /** Epoch ms the last counted focus session ended, to tell whether the next one follows it. */
  lastFocusEnd?: number;
  /** The first tiny step you named for this focus session. */
  firstStep?: string;
  /** `lastFocusEnd` of the session the energy check-in was answered for, so it asks once. */
  energyFor?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  autoStartBreaks: false,
  autoStartWork: false,
  // Alerts are opt-in so the extension stays quiet until the user asks for them.
  notificationsEnabled: false,
  soundEnabled: false,
  sound: 'bell',
  volume: 0.7,
  // Off until the user turns it on and grants the site access it needs.
  blockSites: false,
  blockedSites: [],
  theme: 'system',
  showQuotes: false,
  // Planning is opt-in. Once someone turns it on, they've asked to be asked.
  planEnabled: false,
  planPrompt: true,
  parkingLot: false,
  dayWrapUp: false,
  breakIdeas: false,
  justStart: false,
  keepGoing: false,
  headsUp: false,
  calmClock: false,
  dailyIntention: false,
  visualTimer: false,
  liveIcon: false,
  bigTimer: false,
  showEndsAt: false,
  animateDigits: false,
  minimalMode: false,
  lavaLamp: false,
  pauseNudge: false,
  settleIn: false,
  breathCircle: false,
  awayCheck: false,
  rightClick: false,
  takeCare: false,
  smallWins: false,
  focusGarden: false,
  firstStep: false,
  whereWasI: false,
  timeCheck: false,
  energyCheck: false,
  weeklyLookBack: false,
  driftTally: false,
  rhythmPresets: false,
  focusSound: 'off',
  focusVolume: 0.4,
  highContrast: false,
  colorSafe: false,
  textSize: 'normal',
  easyFont: false,
  reduceMotion: false,
  shortcuts: false,
};

/** How long a "Just start" focus session runs. */
export const JUST_START_MINUTES = 10;

/** How much extra focus "Keep going" adds. */
export const KEEP_GOING_MINUTES = 5;

/** How long before a phase ends the heads-up comes. */
export const HEADS_UP_MS = 60_000;

/** How long the timer sits paused before the "still paused?" reminder. */
export const PAUSE_NUDGE_MS = 10 * 60_000;

/** How long the settle-in breathing lasts before focus. */
export const SETTLE_MS = 30_000;
/** One slow breath: in for 4 seconds, out for 6. */
export const BREATH_IN_MS = 4_000;
export const BREATH_MS = 10_000;

/** How long the computer sits untouched before focus pauses for "away". */
export const AWAY_MS = 5 * 60_000;

/** A take-care reminder comes on the break after every this many focus sessions in a row. */
export const CARE_EVERY = 3;
/**
 * How much longer than a long break the gap between two focus sessions can be
 * and still count as "in a row".
 */
export const IN_A_ROW_SLACK_MS = 15 * 60_000;
/** Taken in turn, so each reminder is a different one. */
export const CARE_TIPS = [
  'Have a glass of water',
  'Rest your eyes on something far away',
  'Stand up and stretch',
  "Grab a snack if you're hungry",
] as const;

export type RhythmId = 'classic' | 'short' | 'deep';

export interface Rhythm {
  id: RhythmId;
  label: string;
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
}

/** The rhythm presets: a whole timer setup in one tap. */
export const RHYTHMS: readonly Rhythm[] = [
  { id: 'classic', label: 'Classic', workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 },
  { id: 'short', label: 'Short', workMinutes: 15, shortBreakMinutes: 3, longBreakMinutes: 10 },
  { id: 'deep', label: 'Deep', workMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 20 },
];

/** The preset the timers match right now, or null for a setup of your own. */
export function rhythmOf(settings: Settings): RhythmId | null {
  const match = RHYTHMS.find(
    (r) =>
      r.workMinutes === settings.workMinutes &&
      r.shortBreakMinutes === settings.shortBreakMinutes &&
      r.longBreakMinutes === settings.longBreakMinutes,
  );
  return match?.id ?? null;
}

/** The settings with a preset's three timer lengths. Everything else stays. */
export function applyRhythm(settings: Settings, id: RhythmId): Settings {
  const r = RHYTHMS.find((x) => x.id === id);
  if (!r) return settings;
  return {
    ...settings,
    workMinutes: r.workMinutes,
    shortBreakMinutes: r.shortBreakMinutes,
    longBreakMinutes: r.longBreakMinutes,
  };
}

export const THEME_LABELS: Record<ThemeId, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export const SOUND_LABELS: Record<SoundId, string> = {
  bell: 'Bell',
  chime: 'Chime',
  digital: 'Digital beep',
};

export const FOCUS_SOUND_LABELS: Record<FocusSoundId, string> = {
  off: 'Off',
  tick: 'Soft ticking',
  brown: 'Brown noise',
  rain: 'Rain',
  waves: 'Ocean waves',
};

export const TEXT_SIZE_LABELS: Record<TextSizeId, string> = {
  normal: 'Normal',
  large: 'Large',
  xlarge: 'Extra large',
};

export const PHASE_LABELS: Record<Phase, string> = {
  work: 'Focus',
  shortBreak: 'Short break',
  longBreak: 'Long break',
};

export function localDateKey(now: number): string {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function phaseDurationMs(phase: Phase, settings: Settings): number {
  const minutes = {
    work: settings.workMinutes,
    shortBreak: settings.shortBreakMinutes,
    longBreak: settings.longBreakMinutes,
  }[phase];
  return minutes * 60_000;
}

/** How long the current phase runs in full, for the progress bar and Stats. */
export function phaseLengthMs(state: TimerState, settings: Settings): number {
  return state.phaseMs ?? phaseDurationMs(state.phase, settings);
}

/**
 * Drops what only belongs to the phase in progress (a "Just start" or "Keep
 * going" length, and the offer to keep going), so a new phase starts plain.
 */
function usualLength(state: TimerState): TimerState {
  const {
    phaseMs: _length,
    extending: _extra,
    afterFocus: _offer,
    pausedAt: _paused,
    settleUntil: _settle,
    away: _away,
    firstStep: _step,
    ...rest
  } = state;
  return rest;
}

export function initialState(settings: Settings, now: number): TimerState {
  return {
    phase: 'work',
    status: 'idle',
    endTime: null,
    remainingMs: phaseDurationMs('work', settings),
    completedInCycle: 0,
    completedToday: 0,
    todayKey: localDateKey(now),
  };
}

export function remainingMs(state: TimerState, now: number): number {
  if (state.status === 'running' && state.endTime !== null) {
    // While settling in, the focus clock holds at its full length.
    const left = state.endTime - Math.max(now, state.settleUntil ?? now);
    return Math.max(0, left);
  }
  return state.remainingMs;
}

/**
 * Starts a fresh day when the local date has rolled over: the daily tally and
 * the dots toward the next long break both go back to zero.
 */
export function rollDay(state: TimerState, now: number): TimerState {
  const key = localDateKey(now);
  return key === state.todayKey
    ? state
    : { ...state, completedToday: 0, completedInCycle: 0, todayKey: key };
}

export function start(state: TimerState, now: number): TimerState {
  if (state.status === 'running') return state;
  const { pausedAt: _, away: _away, ...rest } = state;
  return { ...rest, status: 'running', endTime: now + state.remainingMs };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'running') return state;
  const { settleUntil: _, ...rest } = state;
  return {
    ...rest,
    status: 'paused',
    endTime: null,
    remainingMs: remainingMs(state, now),
    pausedAt: now,
  };
}

/**
 * Whether Start begins with the settle-in breathing: a focus session that
 * hasn't begun yet. Resuming, extra time and "Just start" go straight in.
 */
export function canSettle(state: TimerState, settings: Settings): boolean {
  return (
    settings.settleIn &&
    state.phase === 'work' &&
    state.status === 'idle' &&
    !state.extending &&
    state.remainingMs === phaseLengthMs(state, settings)
  );
}

/** Longest daily intention, so it fits on one line at the top of the timer. */
export const MAX_INTENTION_LENGTH = 60;
/** Longest "where did you leave off?" note, so it fits on one line. */
export const MAX_LEFT_OFF_LENGTH = 80;
export const MAX_STEP_LENGTH = 80;

/** Whether Start asks for the first tiny step: a focus session that hasn't begun yet. */
export function canAskFirstStep(state: TimerState, settings: Settings): boolean {
  return (
    settings.firstStep &&
    state.phase === 'work' &&
    state.status === 'idle' &&
    !state.extending &&
    state.remainingMs === phaseLengthMs(state, settings)
  );
}

/** Notes the first tiny step for the focus session about to start. Blank leaves it out. */
export function withFirstStep(state: TimerState, step: string | undefined): TimerState {
  const clean = String(step ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_STEP_LENGTH);
  return clean && state.phase === 'work' ? { ...state, firstStep: clean } : state;
}

/** Start, with the settle-in breathing first when it's on. */
export function settleStart(state: TimerState, settings: Settings, now: number): TimerState {
  const started = start(state, now);
  if (!canSettle(state, settings)) return started;
  return { ...started, endTime: started.endTime! + SETTLE_MS, settleUntil: now + SETTLE_MS };
}

/** True during the settle-in breathing. */
export function settling(state: TimerState, now: number): boolean {
  return state.status === 'running' && state.settleUntil !== undefined && now < state.settleUntil;
}

/** Ends the breathing early, and the focus clock starts now. */
export function skipSettle(state: TimerState, now: number): TimerState {
  if (!settling(state, now)) return state;
  const { settleUntil, ...rest } = state;
  return { ...rest, endTime: now + (state.endTime! - settleUntil!) };
}

/** "in" or "out", for the breath at `now` during the settle-in. */
export function breathAt(state: TimerState, now: number): 'in' | 'out' {
  const elapsed = now - (state.settleUntil ?? now) + SETTLE_MS;
  return ((elapsed % BREATH_MS) + BREATH_MS) % BREATH_MS < BREATH_IN_MS ? 'in' : 'out';
}

/** Whole seconds left in the current breath in or out, for the small countdown beside it. */
export function breathSecondsLeft(state: TimerState, now: number): number {
  const elapsed = now - (state.settleUntil ?? now) + SETTLE_MS;
  const into = ((elapsed % BREATH_MS) + BREATH_MS) % BREATH_MS;
  const end = into < BREATH_IN_MS ? BREATH_IN_MS : BREATH_MS;
  return Math.max(1, Math.ceil((end - into) / 1000));
}

/**
 * You stepped away during focus: pauses as of when you left, so the time away
 * doesn't run down the clock. Breaks carry on, since stepping away is the point.
 */
export function stepAway(
  state: TimerState,
  settings: Settings,
  leftAt: number,
  now: number,
): TimerState {
  if (!settings.awayCheck || state.phase !== 'work' || state.status !== 'running') return state;
  // You can't have left before this session began.
  const began = state.endTime! - phaseLengthMs(state, settings);
  return { ...pause(state, Math.min(Math.max(leftAt, began), now)), away: true };
}

/**
 * "I was working": the time away was focus after all (reading, thinking), so
 * it counts, and the clock picks up where it would have been.
 */
export function wasWorking(state: TimerState, now: number): TimerState {
  if (state.status !== 'paused' || !state.away || state.pausedAt === undefined) return state;
  const left = Math.max(0, state.remainingMs - (now - state.pausedAt));
  return start({ ...state, remainingMs: left }, now);
}

/** When the "still paused?" reminder is due, or null when there isn't one. */
export function pauseNudgeAt(state: TimerState, settings: Settings): number | null {
  // Coming back asks about an "away" pause, so it doesn't need a reminder too.
  if (
    !settings.pauseNudge ||
    state.status !== 'paused' ||
    state.pausedAt === undefined ||
    state.away
  ) {
    return null;
  }
  return state.pausedAt + PAUSE_NUDGE_MS;
}

/**
 * Whether to offer "Just start": a focus session that hasn't begun yet, when
 * the usual one is longer than the short one.
 */
export function canJustStart(state: TimerState, settings: Settings): boolean {
  return (
    settings.justStart &&
    state.phase === 'work' &&
    state.status === 'idle' &&
    settings.workMinutes > JUST_START_MINUTES
  );
}

/** Starts a short focus session. It counts like any other once it runs out. */
export function justStart(state: TimerState, settings: Settings, now: number): TimerState {
  if (!canJustStart(state, settings)) return state;
  const ms = JUST_START_MINUTES * 60_000;
  return { ...state, status: 'running', endTime: now + ms, remainingMs: ms, phaseMs: ms };
}

/**
 * When the heads-up for the running phase is due, or null when there isn't
 * one. Phases of 2 minutes or less don't get one, since it would come almost
 * right away.
 */
export function headsUpAt(state: TimerState, settings: Settings): number | null {
  if (!settings.headsUp || state.status !== 'running' || state.endTime === null) return null;
  if (phaseLengthMs(state, settings) <= 2 * HEADS_UP_MS) return null;
  return state.endTime - HEADS_UP_MS;
}

/** The focus sound that should be playing right now, or null for silence. */
export function focusSoundNow(
  state: TimerState,
  settings: Settings,
): Exclude<FocusSoundId, 'off'> | null {
  if (settings.focusSound === 'off' || state.phase !== 'work' || state.status !== 'running') {
    return null;
  }
  return settings.focusSound;
}

/** True during the last minute of a running phase that gets a heads-up. */
export function inHeadsUp(state: TimerState, settings: Settings, now: number): boolean {
  const at = headsUpAt(state, settings);
  return at !== null && now >= at && now < state.endTime!;
}

/** Whether to offer "Keep going": on a break that a finished focus session led to. */
export function canKeepGoing(state: TimerState, settings: Settings): boolean {
  return settings.keepGoing && state.phase !== 'work' && state.afterFocus === true;
}

/**
 * Goes back to focus for a few more minutes, and the break waits. The focus
 * session already counted, so the extra time adds focus minutes but not another
 * pomodoro. When it ends, the same kind of break comes next.
 */
export function keepGoing(state: TimerState, settings: Settings, now: number): TimerState {
  if (!canKeepGoing(state, settings)) return state;
  const ms = KEEP_GOING_MINUTES * 60_000;
  return {
    ...usualLength(state),
    phase: 'work',
    status: 'running',
    endTime: now + ms,
    remainingMs: ms,
    phaseMs: ms,
    extending: true,
  };
}

/** Puts the current phase back to its full length without changing phase. */
export function reset(state: TimerState, settings: Settings): TimerState {
  return {
    ...usualLength(state),
    status: 'idle',
    endTime: null,
    remainingMs: phaseDurationMs(state.phase, settings),
  };
}

/** Jumps to a specific phase, ready to start, without counting anything. */
export function setPhase(state: TimerState, phase: Phase, settings: Settings): TimerState {
  return {
    ...usualLength(state),
    phase,
    status: 'idle',
    endTime: null,
    remainingMs: phaseDurationMs(phase, settings),
  };
}

/**
 * Moves to the next phase. `countWork` is true when a focus session actually
 * ran to completion, and false when the user skipped it. `finishedAt` is when
 * the phase ended, which is earlier than `now` when the app catches up on a
 * phase that ended while it was closed; a focus session counts toward that day.
 */
export function advance(
  state: TimerState,
  settings: Settings,
  now: number,
  countWork: boolean,
  finishedAt: number = now,
): TimerState {
  let s = rollDay(usualLength(state), finishedAt);
  let next: Phase;
  // Extra "Keep going" time ran out, or a real focus session did.
  const ranOut = state.phase === 'work' && countWork;
  const counts = ranOut && !state.extending;

  if (s.phase === 'work') {
    const completedInCycle = counts ? s.completedInCycle + 1 : s.completedInCycle;
    const completedToday = counts ? s.completedToday + 1 : s.completedToday;
    s = { ...s, completedInCycle, completedToday };
    if (counts) {
      // A run carries on when this session began soon enough after the last one ended.
      const began = finishedAt - phaseLengthMs(state, settings);
      const gap = s.lastFocusEnd === undefined ? Infinity : began - s.lastFocusEnd;
      const follows = gap <= settings.longBreakMinutes * 60_000 + IN_A_ROW_SLACK_MS;
      s = { ...s, inARow: follows ? (s.inARow ?? 0) + 1 : 1, lastFocusEnd: finishedAt };
    }
    next = completedInCycle >= settings.sessionsBeforeLongBreak ? 'longBreak' : 'shortBreak';
    s = rollDay(s, now);
  } else {
    s = rollDay(s, now);
    if (s.phase === 'longBreak') s = { ...s, completedInCycle: 0 };
    next = 'work';
  }

  const autoStart = next === 'work' ? settings.autoStartWork : settings.autoStartBreaks;
  const duration = phaseDurationMs(next, settings);
  return {
    ...s,
    phase: next,
    status: autoStart ? 'running' : 'idle',
    endTime: autoStart ? now + duration : null,
    remainingMs: duration,
    ...(ranOut ? { afterFocus: true } : {}),
  };
}

/**
 * On the break after every few focus sessions in a row, a reminder to look
 * after yourself ("3 in a row. Have a glass of water"), or null.
 */
export function careNudge(state: TimerState, settings: Settings): string | null {
  const n = state.inARow ?? 0;
  if (!settings.takeCare || state.phase === 'work' || !state.afterFocus) return null;
  if (n < CARE_EVERY || n % CARE_EVERY !== 0) return null;
  return `${n} in a row. ${CARE_TIPS[(n / CARE_EVERY - 1) % CARE_TIPS.length]}`;
}

/** How long after a focus session ends opening the timer still celebrates it. */
export const WIN_WINDOW_MS = 30 * 60_000;
const WIN_WORDS = ['Nice work!', 'Well done!', 'You did it!', 'One more done!'] as const;

/**
 * The "small wins" line for a focus session that just finished, or null:
 * "Nice work! 3 done today." Each finished session is celebrated once
 * (`celebrated` is the end time of the last one that was), and only soon after.
 */
export function smallWin(
  state: TimerState,
  settings: Settings,
  celebrated: number | null,
  now: number,
): string | null {
  const ended = state.lastFocusEnd;
  if (!settings.smallWins || state.phase === 'work' || !state.afterFocus || ended === undefined) {
    return null;
  }
  if (ended === celebrated || now - ended > WIN_WINDOW_MS) return null;
  const n = state.completedToday;
  return `${WIN_WORDS[(n + WIN_WORDS.length - 1) % WIN_WORDS.length]} ${n} done today.`;
}

/** Whole minutes left, rounded up, for the calm clock: "25" until 24:00, then "24". */
export function calmMinutes(ms: number): number {
  return Math.ceil(ms / 60_000);
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function sanitizeSettings(input: Partial<Settings>): Settings {
  const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const d = DEFAULT_SETTINGS;
  return {
    workMinutes: clampInt(input.workMinutes, 1, 180, d.workMinutes),
    shortBreakMinutes: clampInt(input.shortBreakMinutes, 1, 60, d.shortBreakMinutes),
    longBreakMinutes: clampInt(input.longBreakMinutes, 1, 120, d.longBreakMinutes),
    sessionsBeforeLongBreak: clampInt(
      input.sessionsBeforeLongBreak,
      1,
      12,
      d.sessionsBeforeLongBreak,
    ),
    autoStartBreaks: input.autoStartBreaks ?? d.autoStartBreaks,
    autoStartWork: input.autoStartWork ?? d.autoStartWork,
    notificationsEnabled: input.notificationsEnabled ?? d.notificationsEnabled,
    soundEnabled: input.soundEnabled ?? d.soundEnabled,
    sound: input.sound && input.sound in SOUND_LABELS ? input.sound : d.sound,
    volume: Number.isFinite(Number(input.volume))
      ? Math.min(1, Math.max(0, Number(input.volume)))
      : d.volume,
    blockSites: input.blockSites ?? d.blockSites,
    blockedSites:
      input.blockedSites === undefined ? d.blockedSites : sanitizeSites(input.blockedSites),
    theme: input.theme && input.theme in THEME_LABELS ? input.theme : d.theme,
    showQuotes: input.showQuotes ?? d.showQuotes,
    planEnabled: input.planEnabled ?? d.planEnabled,
    planPrompt: input.planPrompt ?? d.planPrompt,
    parkingLot: input.parkingLot ?? d.parkingLot,
    dayWrapUp: input.dayWrapUp ?? d.dayWrapUp,
    breakIdeas: input.breakIdeas ?? d.breakIdeas,
    justStart: input.justStart ?? d.justStart,
    keepGoing: input.keepGoing ?? d.keepGoing,
    headsUp: input.headsUp ?? d.headsUp,
    calmClock: input.calmClock ?? d.calmClock,
    dailyIntention: input.dailyIntention ?? d.dailyIntention,
    visualTimer: input.visualTimer ?? d.visualTimer,
    liveIcon: input.liveIcon ?? d.liveIcon,
    bigTimer: input.bigTimer ?? d.bigTimer,
    showEndsAt: input.showEndsAt ?? d.showEndsAt,
    animateDigits: input.animateDigits ?? d.animateDigits,
    minimalMode: input.minimalMode ?? d.minimalMode,
    lavaLamp: input.lavaLamp ?? d.lavaLamp,
    pauseNudge: input.pauseNudge ?? d.pauseNudge,
    settleIn: input.settleIn ?? d.settleIn,
    breathCircle: input.breathCircle ?? d.breathCircle,
    awayCheck: input.awayCheck ?? d.awayCheck,
    rightClick: input.rightClick ?? d.rightClick,
    takeCare: input.takeCare ?? d.takeCare,
    smallWins: input.smallWins ?? d.smallWins,
    focusGarden: input.focusGarden ?? d.focusGarden,
    firstStep: input.firstStep ?? d.firstStep,
    whereWasI: input.whereWasI ?? d.whereWasI,
    timeCheck: input.timeCheck ?? d.timeCheck,
    energyCheck: input.energyCheck ?? d.energyCheck,
    weeklyLookBack: input.weeklyLookBack ?? d.weeklyLookBack,
    driftTally: input.driftTally ?? d.driftTally,
    rhythmPresets: input.rhythmPresets ?? d.rhythmPresets,
    focusSound:
      input.focusSound && input.focusSound in FOCUS_SOUND_LABELS ? input.focusSound : d.focusSound,
    focusVolume: Number.isFinite(Number(input.focusVolume))
      ? Math.min(1, Math.max(0, Number(input.focusVolume)))
      : d.focusVolume,
    highContrast: input.highContrast ?? d.highContrast,
    colorSafe: input.colorSafe ?? d.colorSafe,
    textSize: input.textSize && input.textSize in TEXT_SIZE_LABELS ? input.textSize : d.textSize,
    easyFont: input.easyFont ?? d.easyFont,
    reduceMotion: input.reduceMotion ?? d.reduceMotion,
    shortcuts: input.shortcuts ?? d.shortcuts,
  };
}

/** The time check speaks up on the hour from 8 am through 9 pm, never overnight. */
export const TIME_CHECK_FIRST_HOUR = 8;
export const TIME_CHECK_LAST_HOUR = 21;
/** A check that fires later than this (the computer slept) stays quiet. */
const TIME_CHECK_LATE_MS = 2 * 60_000;

/** The next top of the hour after `now`. */
export function nextHour(now: number): number {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.getTime();
}

/**
 * The hour a time check is due for, or null: it must be on, in waking hours,
 * and fresh, so a late wake-up doesn't announce an hour that's long gone.
 */
export function timeCheckDue(settings: Settings, now: number): number | null {
  if (!settings.timeCheck) return null;
  const hour = new Date(now);
  hour.setMinutes(0, 0, 0);
  const h = hour.getHours();
  if (now - hour.getTime() > TIME_CHECK_LATE_MS) return null;
  return h >= TIME_CHECK_FIRST_HOUR && h <= TIME_CHECK_LAST_HOUR ? hour.getTime() : null;
}

/** What the time check says: the hour, and how the timer stands if it's running. */
export function timeCheckText(state: TimerState, hour: number): { title: string; body: string } {
  const h = new Date(hour).getHours();
  const title = `It's ${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
  if (state.status !== 'running' || state.endTime === null) {
    return { title, body: 'A quick time check.' };
  }
  const left = Math.max(1, Math.ceil((state.endTime - hour) / 60_000));
  return { title, body: `${PHASE_LABELS[state.phase]} has ${left} min left.` };
}
