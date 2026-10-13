// Pure timer logic shared by the background worker, popup, and options page.
// Nothing in this file touches `chrome.*`, so it can be unit tested in Node.

import { sanitizeSites } from './blocker';

export type Phase = 'work' | 'shortBreak' | 'longBreak';
export type Status = 'idle' | 'running' | 'paused';
export type SoundId = 'bell' | 'chime' | 'digital';
export type ThemeId = 'system' | 'light' | 'dark';

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
  /** With planning on, offer a card on the first open of each day. */
  planPrompt: boolean;
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
};

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
    return Math.max(0, state.endTime - now);
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
  return { ...state, status: 'running', endTime: now + state.remainingMs };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'running') return state;
  return { ...state, status: 'paused', endTime: null, remainingMs: remainingMs(state, now) };
}

/** Puts the current phase back to its full length without changing phase. */
export function reset(state: TimerState, settings: Settings): TimerState {
  return {
    ...state,
    status: 'idle',
    endTime: null,
    remainingMs: phaseDurationMs(state.phase, settings),
  };
}

/** Jumps to a specific phase, ready to start, without counting anything. */
export function setPhase(state: TimerState, phase: Phase, settings: Settings): TimerState {
  return {
    ...state,
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
  let s = rollDay(state, finishedAt);
  let next: Phase;

  if (s.phase === 'work') {
    const completedInCycle = countWork ? s.completedInCycle + 1 : s.completedInCycle;
    const completedToday = countWork ? s.completedToday + 1 : s.completedToday;
    s = { ...s, completedInCycle, completedToday };
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
  };
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
  };
}
