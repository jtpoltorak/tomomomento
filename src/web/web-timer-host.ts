// The web app's timer engine. It does the background worker's job inside the
// page: the timer is still stored as an absolute end time, so a throttled
// background tab, a reload, or a closed laptop lid can't make it drift. It just
// lives in localStorage instead of chrome.storage, and a setTimeout replaces
// chrome.alarms.

import type { BackupData } from '../shared/backup';
import { FocusSoundPlayer } from '../shared/focus-sounds';
import type { Command, CommandResponse } from '../shared/messages';
import { playSound, type AlertSound } from '../shared/sounds';
import { sanitizeParkingLot, type ParkingLot } from '../shared/parking';
import { planDoneMessage, sanitizePlanData, type PlanData } from '../shared/plan';
import {
  addFocusMinutes,
  recordEnergy,
  recordPomodoro,
  sanitizeHistory,
  seedHistory,
  type History,
} from '../shared/stats';
import {
  advance,
  careNudge,
  calmMinutes,
  focusSoundNow,
  headsUpAt,
  justStart,
  keepGoing,
  DEFAULT_SETTINGS,
  formatClock,
  initialState,
  pause,
  pauseNudgeAt,
  phaseLengthMs,
  PHASE_LABELS,
  remainingMs,
  reset,
  rollDay,
  sanitizeSettings,
  setPhase,
  settleStart,
  withFirstStep,
  skipSettle,
  wasWorking,
  type Phase,
  type Settings,
  type TimerState,
} from '../shared/timer';
import type { HostSnapshot, TimerHost } from '../popup/app/timer-host';

// These keep the app's original name (Tomatick) so people who already use the
// web app keep their settings, and old and new tabs share one timer.
const KEYS = {
  settings: 'tomatick.settings',
  state: 'tomatick.state',
  hint: 'tomatick.alertHintDismissed',
  helpersTip: 'tomomomento.helpersTipDismissed',
  history: 'tomomomento.history',
  plan: 'tomomomento.plan',
  parkingLot: 'tomomomento.parkingLot',
  /** The end time of the phase whose heads-up already played, so only one tab plays it. */
  headsUpFor: 'tomomomento.headsUpFor',
  /** When the paused timer's reminder already showed, so only one tab shows it. */
  pauseNudgeFor: 'tomomomento.pauseNudgeFor',
  /**
   * The tab that plays the focus sound: the last one you used, since browsers
   * only let a tab play sound after a click in it.
   */
  focusSoundTab: 'tomomomento.focusSoundTab',
};
const LOCK_NAME = 'tomatick-timer';
const NOTIFICATION_TAG = 'phase-complete';
const PAUSE_NOTIFICATION_TAG = 'still-paused';
const APP_TITLE = 'Tomomomento: Focus Timer';

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Private browsing or a full quota: the timer still runs for this visit.
    console.warn('Could not save', key, err);
  }
}

function loadSettings(): Settings {
  return sanitizeSettings({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEYS.settings) });
}

function loadState(): TimerState {
  return read<TimerState>(KEYS.state) ?? initialState(loadSettings(), Date.now());
}

function loadPlan(): PlanData {
  return sanitizePlanData(read<unknown>(KEYS.plan));
}

function loadHistory(): History {
  const stored = read<unknown>(KEYS.history);
  return stored === undefined ? seedHistory(loadState(), loadSettings()) : sanitizeHistory(stored);
}

/**
 * Runs `task` while holding a lock shared by every tab of the app, so two open
 * tabs can't both finish the same phase (and both ring).
 */
function withLock<T>(task: () => T): Promise<T> {
  if (!navigator.locks) return Promise.resolve().then(task);
  return navigator.locks.request(LOCK_NAME, async () => task());
}

export class WebTimerHost implements TimerHost {
  private readonly listeners = new Set<() => void>();
  private phaseTimer: ReturnType<typeof setTimeout> | undefined;
  private titleTimer: ReturnType<typeof setInterval> | undefined;
  private headsUpTimer: ReturnType<typeof setTimeout> | undefined;
  private nudgeTimer: ReturnType<typeof setTimeout> | undefined;
  private audio: AudioContext | undefined;
  private focusPlayer: FocusSoundPlayer | undefined;
  private readonly tabId = crypto.randomUUID();
  private notification: Notification | undefined;
  private pauseNotification: Notification | undefined;
  /** Set when a phase ends on its own, for the "time's up" tab title. */
  private justFinished = false;

  constructor() {
    // Another tab changed the timer or settings.
    window.addEventListener('storage', (event) => {
      if (event.key !== null && !Object.values(KEYS).includes(event.key)) return;
      this.justFinished = false;
      this.schedule(loadState());
      this.emit();
    });
    // Timers in hidden tabs can be delayed, so check again when the tab comes back.
    document.addEventListener('visibilitychange', () => void this.completeIfDue(true));
    // A closing tab hands the focus sound back, so a stale id doesn't linger.
    window.addEventListener('pagehide', () => {
      if (read<string>(KEYS.focusSoundTab) === this.tabId)
        localStorage.removeItem(KEYS.focusSoundTab);
    });
    this.schedule(loadState());
    // A phase may have ended while the page was closed. Catch up quietly.
    void this.completeIfDue(false);
  }

  async load(): Promise<HostSnapshot> {
    return {
      state: loadState(),
      settings: loadSettings(),
      alertHintDismissed: Boolean(read<boolean>(KEYS.hint)),
      helpersTipDismissed: Boolean(read<boolean>(KEYS.helpersTip)),
      blockerAccess: false,
      history: loadHistory(),
      plan: loadPlan(),
      parkingLot: sanitizeParkingLot(read<unknown>(KEYS.parkingLot)),
    };
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(command: Command): Promise<CommandResponse> {
    // Browsers only allow sound after a click, and this runs during one.
    this.unlockSounds(loadSettings());
    // Whatever you just did answers "still paused?".
    void this.closeNotification(PAUSE_NOTIFICATION_TAG);
    return withLock(() => {
      const settings = loadSettings();
      const now = Date.now();
      const state = rollDay(loadState(), now);
      this.justFinished = false;
      switch (command.command) {
        case 'start':
          return this.commit(settleStart(withFirstStep(state, command.step), settings, now));
        case 'justStart':
          return this.commit(justStart(state, settings, now));
        case 'keepGoing':
          void this.closeNotification();
          return this.commit(keepGoing(state, settings, now));
        case 'skipSettle':
          return this.commit(skipSettle(state, now));
        case 'wasWorking':
          return this.commit(wasWorking(state, now));
        case 'rateEnergy': {
          const at = state.lastFocusEnd;
          if (at === undefined || state.energyFor === at) return state;
          write(KEYS.history, recordEnergy(loadHistory(), at, command.level));
          return this.commit({ ...state, energyFor: at });
        }
        case 'pause':
          return this.commit(pause(state, now));
        case 'reset':
          return this.commit(reset(state, settings));
        case 'setPhase':
          return this.commit(setPhase(state, command.phase, settings));
        case 'skip':
          void this.closeNotification();
          return this.commit(advance(state, settings, now, false));
      }
    })
      .then((state): CommandResponse => ({ ok: true, state }))
      .catch((err: unknown): CommandResponse => ({ ok: false, error: String(err) }));
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.unlockSounds(settings);
    await withLock(() => {
      write(KEYS.settings, sanitizeSettings(settings));
      // An idle timer should show the new length right away.
      const state = loadState();
      if (state.status === 'idle') this.commit(reset(state, loadSettings()));
      else {
        this.schedule(state); // the heads-up may have been turned on or off
        this.emit();
      }
    });
  }

  async requestBlockerAccess(): Promise<boolean> {
    return false;
  }

  async requestNotificationAccess(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission !== 'default') return Notification.permission === 'granted';
    return (await Notification.requestPermission()) === 'granted';
  }

  async dismissAlertHint(): Promise<void> {
    write(KEYS.hint, true);
  }

  async dismissHelpersTip(): Promise<void> {
    write(KEYS.helpersTip, true);
  }

  async resetStats(): Promise<void> {
    await withLock(() => {
      write(KEYS.history, {});
      this.emit();
    });
  }

  async savePlan(plan: PlanData): Promise<void> {
    await withLock(() => {
      write(KEYS.plan, plan);
      this.emit();
    });
  }

  async saveParkingLot(lot: ParkingLot): Promise<void> {
    await withLock(() => {
      write(KEYS.parkingLot, lot);
      this.emit();
    });
  }

  async restoreData(data: BackupData): Promise<void> {
    await withLock(() => {
      write(KEYS.settings, sanitizeSettings(data.settings));
      write(KEYS.history, data.history);
      write(KEYS.plan, data.plan);
      write(KEYS.parkingLot, data.parkingLot);
      // An idle timer should show the restored length right away.
      const state = loadState();
      if (state.status === 'idle') this.commit(reset(state, loadSettings()));
      else this.emit();
    });
  }

  async needsTabForFiles(): Promise<boolean> {
    return false;
  }

  async openSettingsTab(): Promise<void> {}

  private commit(state: TimerState): TimerState {
    write(KEYS.state, state);
    this.schedule(state);
    this.emit();
    return state;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** Arms a timeout for the end of the phase and keeps the tab title counting down. */
  private schedule(state: TimerState): void {
    clearTimeout(this.phaseTimer);
    clearInterval(this.titleTimer);
    clearTimeout(this.headsUpTimer);
    clearTimeout(this.nudgeTimer);
    const nudge = pauseNudgeAt(state, loadSettings());
    if (nudge !== null) {
      this.nudgeTimer = setTimeout(() => void this.pauseNudge(), Math.max(0, nudge - Date.now()));
    }
    if (state.status === 'running' && state.endTime !== null) {
      const delay = Math.max(0, state.endTime - Date.now());
      this.phaseTimer = setTimeout(() => void this.completeIfDue(true), delay + 50);
      this.titleTimer = setInterval(() => this.updateTitle(state), 1000);
      const headsUp = headsUpAt(state, loadSettings());
      if (headsUp !== null && headsUp > Date.now()) {
        this.headsUpTimer = setTimeout(() => void this.headsUp(), headsUp - Date.now());
      }
    }
    this.updateTitle(state);
    this.syncFocusSound(state);
  }

  /** Plays the focus sound in this tab while focus runs, if this is the tab that plays it. */
  private syncFocusSound(state: TimerState): void {
    const settings = loadSettings();
    const sound = focusSoundNow(state, settings);
    if (!sound || read<string>(KEYS.focusSoundTab) !== this.tabId) {
      this.focusPlayer?.stop();
      return;
    }
    this.audio ??= new AudioContext();
    this.focusPlayer ??= new FocusSoundPlayer(this.audio);
    void this.audio.resume();
    this.focusPlayer.play(sound, settings.focusVolume, state.endTime);
  }

  private updateTitle(state: TimerState): void {
    const label = PHASE_LABELS[state.phase];
    if (state.status === 'running' || state.status === 'paused') {
      const left = remainingMs(state, Date.now());
      const clock = loadSettings().calmClock ? `${calmMinutes(left)} min` : formatClock(left);
      const nudge = pauseNudgeAt(state, loadSettings());
      if (nudge !== null && Date.now() >= nudge) {
        document.title = `Still paused? ${clock} ${label} · Tomomomento`;
        return;
      }
      const paused = state.status === 'paused' ? ' (paused)' : '';
      document.title = `${clock} ${label}${paused} · Tomomomento`;
    } else if (this.justFinished) {
      document.title = `✓ Time for your ${label.toLowerCase()} · Tomomomento`;
    } else {
      document.title = APP_TITLE;
    }
  }

  /**
   * "Still paused?": the tab title asks, and so does a quiet notification
   * when the browser allows them. Once per pause, across tabs.
   */
  private pauseNudge(): Promise<void> {
    return withLock(() => {
      const state = loadState();
      const at = pauseNudgeAt(state, loadSettings());
      if (at === null || Date.now() < at) return;
      this.updateTitle(state);
      if (read<number>(KEYS.pauseNudgeFor) === state.pausedAt) return;
      write(KEYS.pauseNudgeFor, state.pausedAt);
      void this.showPauseNotification(state).catch((err: unknown) =>
        console.error('Reminder failed', err),
      );
    });
  }

  private async showPauseNotification(state: TimerState): Promise<void> {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const minutesLeft = Math.ceil(state.remainingMs / 60_000);
    const title = 'Still paused';
    const options: NotificationOptions = {
      body: `${PHASE_LABELS[state.phase]} has ${minutesLeft} min left. Pick it back up?`,
      icon: 'icons/icon-192.png',
      tag: PAUSE_NOTIFICATION_TAG,
      silent: true,
    };
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
    this.pauseNotification?.close();
    const notification = (this.pauseNotification = new Notification(title, options));
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }

  /** The quiet tone a minute before the phase ends, for people who turned sound on. */
  private headsUp(): Promise<void> {
    return withLock(() => {
      const state = loadState();
      const settings = loadSettings();
      const at = headsUpAt(state, settings);
      // A throttled background tab can fire late; skip it once the minute is mostly gone.
      const now = Date.now();
      if (at === null || now > at + 20_000 || !settings.soundEnabled) return;
      if (read<number>(KEYS.headsUpFor) === state.endTime) return;
      write(KEYS.headsUpFor, state.endTime);
      this.playSound('headsUp', settings.volume).catch((err: unknown) =>
        console.error('Heads-up failed', err),
      );
    });
  }

  /** Finishes the current phase if its end time has passed. */
  private completeIfDue(alert: boolean): Promise<void> {
    return withLock(() => {
      const state = loadState();
      if (state.status !== 'running' || state.endTime === null || state.endTime > Date.now()) {
        return;
      }
      const settings = loadSettings();
      const next = advance(state, settings, Date.now(), true, state.endTime);
      if (state.phase === 'work') {
        // Read before the state is saved, so a first history still sees today's old tally.
        const minutes = Math.round(phaseLengthMs(state, settings) / 60_000);
        const history = loadHistory();
        write(
          KEYS.history,
          state.extending
            ? addFocusMinutes(history, state.endTime, minutes)
            : recordPomodoro(history, state.endTime, minutes),
        );
      }
      this.justFinished = next.status === 'idle';
      this.commit(next);
      if (alert)
        void this.alertPhaseComplete(state.phase, next, settings, state.extending === true);
    });
  }

  private async alertPhaseComplete(
    finished: Phase,
    next: TimerState,
    settings: Settings,
    extended: boolean,
  ): Promise<void> {
    const tasks: Promise<void>[] = [];
    if (settings.soundEnabled) tasks.push(this.playAlertSound(settings));
    if (settings.notificationsEnabled) {
      const planLine =
        finished === 'work' && !extended ? planDoneMessage(loadPlan(), settings, next) : null;
      const care = careNudge(next, settings);
      const lines = [planLine, care && `${care}.`].filter(Boolean).join(' ') || null;
      tasks.push(this.showNotification(finished, next, lines, extended));
    }
    const results = await Promise.allSettled(tasks);
    for (const r of results) if (r.status === 'rejected') console.error('Alert failed', r.reason);
  }

  /** Called during a click: wakes up audio, and makes this the tab that plays the focus sound. */
  private unlockSounds(settings: Settings): void {
    if (settings.soundEnabled || settings.focusSound !== 'off') this.unlockAudio();
    if (settings.focusSound !== 'off') write(KEYS.focusSoundTab, this.tabId);
  }

  private unlockAudio(): void {
    this.audio ??= new AudioContext();
    void this.audio.resume();
  }

  private async playAlertSound(settings: Settings): Promise<void> {
    await this.playSound(settings.sound, settings.volume);
  }

  private async playSound(sound: AlertSound, volume: number): Promise<void> {
    this.audio ??= new AudioContext();
    await this.audio.resume();
    await playSound(this.audio, sound, volume);
  }

  private async showNotification(
    finished: Phase,
    next: TimerState,
    planLine: string | null,
    extended: boolean,
  ): Promise<void> {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const title = extended
      ? 'Extra time is up'
      : finished === 'work'
        ? 'Focus session complete'
        : 'Break is over';
    const nextLine =
      next.status === 'running'
        ? `${PHASE_LABELS[next.phase]} started.`
        : `Ready for your ${PHASE_LABELS[next.phase].toLowerCase()}.`;
    const options: NotificationOptions = {
      body: planLine ? `${planLine} ${nextLine}` : nextLine,
      icon: 'icons/icon-192.png',
      tag: NOTIFICATION_TAG,
      requireInteraction: next.status !== 'running',
    };
    // Some browsers (Chrome on Android) only show notifications through the service worker.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
    this.notification?.close();
    const notification = (this.notification = new Notification(title, options));
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }

  private async closeNotification(tag = NOTIFICATION_TAG): Promise<void> {
    (tag === NOTIFICATION_TAG ? this.notification : this.pauseNotification)?.close();
    const registration = await navigator.serviceWorker?.getRegistration();
    const open = (await registration?.getNotifications({ tag })) ?? [];
    for (const n of open) n.close();
  }
}
