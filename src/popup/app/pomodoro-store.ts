import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import type { Command } from '../../shared/messages';
import { applyBackup, type BackupData } from '../../shared/backup';
import {
  clearThoughts,
  EMPTY_PARKING_LOT,
  markSeen,
  markWrapped,
  parkThought,
  removeThought,
  unseenCount,
  type ParkingLot,
} from '../../shared/parking';
import { clearPlan, EMPTY_PLAN_DATA, planFor, savePlan, type PlanData } from '../../shared/plan';
import type { History } from '../../shared/stats';
import {
  DEFAULT_SETTINGS,
  initialState,
  phaseLengthMs,
  remainingMs,
  rollDay,
  type Settings,
  type TimerState,
} from '../../shared/timer';
import { TIMER_HOST } from './timer-host';

/**
 * The UI's view of the timer. The host (the background worker in the
 * extension, an in-page engine on the web) owns the real state; this store
 * mirrors it into signals and forwards the user's commands back to the host.
 */
@Injectable({ providedIn: 'root' })
export class PomodoroStore {
  private readonly host = inject(TIMER_HOST);

  readonly state = signal<TimerState>(initialState(DEFAULT_SETTINGS, Date.now()));
  readonly settings = signal<Settings>(DEFAULT_SETTINGS);
  readonly loaded = signal(false);
  readonly alertHintDismissed = signal(true);
  readonly helpersTipDismissed = signal(true);
  /** Whether the user has granted the site access the blocker needs. */
  readonly blockerAccess = signal(false);
  /** Finished focus sessions per day, for the Stats screen. */
  readonly history = signal<History>({});
  /** "Plan my day" data. Use `todayPlan` for the plan that counts right now. */
  readonly plan = signal<PlanData>(EMPTY_PLAN_DATA);
  readonly parkingLot = signal<ParkingLot>(EMPTY_PARKING_LOT);

  /** Ticks while the timer runs so the countdown re-renders. */
  private readonly now = signal(Date.now());
  /** The current time, updated with the countdown. */
  readonly tick = this.now.asReadonly();

  readonly remainingMs = computed(() => remainingMs(this.state(), this.now()));
  readonly totalMs = computed(() => phaseLengthMs(this.state(), this.settings()));
  /** 0 at the start of a phase, 1 when it ends. */
  readonly progress = computed(() => {
    const total = this.totalMs();
    return total > 0 ? Math.min(1, Math.max(0, 1 - this.remainingMs() / total)) : 0;
  });
  /** Today's plan, when planning is on and a plan was made today. */
  readonly todayPlan = computed(() =>
    this.settings().planEnabled ? planFor(this.plan(), this.state().todayKey) : null,
  );
  /** The once-a-day "Plan today?" card. */
  readonly showPlanPrompt = computed(() => {
    const s = this.settings();
    const today = this.state().todayKey;
    return s.planEnabled && s.planPrompt && !this.todayPlan() && this.plan().skippedOn !== today;
  });

  /** Thoughts waiting in the parking lot, or 0 when it's turned off. */
  readonly parkedCount = computed(() =>
    this.settings().parkingLot ? this.parkingLot().thoughts.length : 0,
  );
  /** On a break, a nudge to look at thoughts parked since you last did. */
  readonly parkedOnBreak = computed(() =>
    this.settings().parkingLot && this.state().phase !== 'work'
      ? unseenCount(this.parkingLot())
      : 0,
  );

  readonly alertsOff = computed(
    () => !this.settings().soundEnabled && !this.settings().notificationsEnabled,
  );

  constructor() {
    void this.refresh();

    const unsubscribe = this.host.onChange(() => void this.refresh());
    inject(DestroyRef).onDestroy(unsubscribe);

    // Yesterday's tally shouldn't greet you today, or linger past midnight.
    let midnight: ReturnType<typeof setTimeout> | undefined;
    const rollAtMidnight = (): void => {
      midnight = setTimeout(() => {
        this.state.update((state) => rollDay(state, Date.now()));
        rollAtMidnight();
      }, msUntilTomorrow(Date.now()));
    };
    rollAtMidnight();
    inject(DestroyRef).onDestroy(() => clearTimeout(midnight));

    effect((onCleanup) => {
      if (this.state().status !== 'running') return;
      this.now.set(Date.now());
      const id = setInterval(() => this.now.set(Date.now()), 250);
      onCleanup(() => clearInterval(id));
    });
  }

  async refresh(): Promise<void> {
    const {
      state,
      settings,
      alertHintDismissed,
      helpersTipDismissed,
      blockerAccess,
      history,
      plan,
      parkingLot,
    } = await this.host.load();
    this.helpersTipDismissed.set(helpersTipDismissed);
    this.parkingLot.set(parkingLot);
    this.blockerAccess.set(blockerAccess);
    this.history.set(history);
    this.plan.set(plan);
    this.state.set(rollDay(state, Date.now()));
    this.settings.set(settings);
    this.alertHintDismissed.set(alertHintDismissed);
    this.now.set(Date.now());
    this.loaded.set(true);
  }

  async send(command: Command): Promise<void> {
    const res = await this.host.send(command);
    if (res.ok) {
      this.now.set(Date.now());
      this.state.set(rollDay(res.state, Date.now()));
    } else {
      console.error(res.error);
    }
  }

  async updateSettings(settings: Settings): Promise<void> {
    const wasPlanning = this.settings().planEnabled;
    this.settings.set(settings);
    await this.host.saveSettings(settings);
    // Turning planning off forgets today's plan, so turning it back on starts clean.
    if (wasPlanning && !settings.planEnabled && this.plan().plan) {
      await this.setPlan(clearPlan(this.plan()));
    }
  }

  async savePlan(pomodoros: number, labels: readonly string[]): Promise<void> {
    await this.setPlan(savePlan(this.plan(), this.state().todayKey, pomodoros, labels));
  }

  async clearPlan(): Promise<void> {
    await this.setPlan(clearPlan(this.plan()));
  }

  /** "Not today": hides the plan card until tomorrow. */
  async skipPlanToday(): Promise<void> {
    await this.setPlan({ ...this.plan(), skippedOn: this.state().todayKey });
  }

  private async setPlan(plan: PlanData): Promise<void> {
    this.plan.set(plan);
    await this.host.savePlan(plan);
  }

  async parkThought(text: string): Promise<void> {
    await this.setParkingLot(parkThought(this.parkingLot(), text, Date.now(), crypto.randomUUID()));
  }

  async removeThought(id: string): Promise<void> {
    await this.setParkingLot(removeThought(this.parkingLot(), id));
  }

  async clearThoughts(): Promise<void> {
    await this.setParkingLot(clearThoughts(this.parkingLot()));
  }

  /** Opening the lot, or "Later" on the break card, quiets the card until something new is parked. */
  async markParkingSeen(): Promise<void> {
    await this.setParkingLot(markSeen(this.parkingLot(), Date.now()));
  }

  /** Starting the day wrap-up, or "Not tonight", quiets its card until tomorrow evening. */
  async markWrappedUp(): Promise<void> {
    await this.setParkingLot(markWrapped(this.parkingLot(), this.state().todayKey));
  }

  private async setParkingLot(lot: ParkingLot): Promise<void> {
    this.parkingLot.set(lot);
    await this.host.saveParkingLot(lot);
  }

  /** Everything a backup holds, as it stands now. */
  backupData(): BackupData {
    return {
      settings: this.settings(),
      history: this.history(),
      plan: this.plan(),
      parkingLot: this.parkingLot(),
    };
  }

  /**
   * Restores a backup. Switches that need this browser's permission keep
   * their current value; stats and parked thoughts are combined.
   */
  async restoreBackup(incoming: BackupData, keep: readonly (keyof Settings)[]): Promise<Settings> {
    const next = applyBackup(this.backupData(), incoming, keep, this.state().todayKey);
    await this.host.restoreData(next);
    await this.refresh();
    return next.settings;
  }

  needsTabForFiles(): Promise<boolean> {
    return this.host.needsTabForFiles();
  }

  openSettingsTab(): Promise<void> {
    return this.host.openSettingsTab();
  }

  /** Must be called straight from a click, since Chrome only prompts on a user gesture. */
  async requestBlockerAccess(): Promise<boolean> {
    const granted = await this.host.requestBlockerAccess();
    this.blockerAccess.set(granted);
    return granted;
  }

  /** Must be called straight from a click, since browsers only prompt on a user gesture. */
  requestNotificationAccess(): Promise<boolean> {
    return this.host.requestNotificationAccess();
  }

  async dismissAlertHint(): Promise<void> {
    this.alertHintDismissed.set(true);
    await this.host.dismissAlertHint();
  }

  async dismissHelpersTip(): Promise<void> {
    this.helpersTipDismissed.set(true);
    await this.host.dismissHelpersTip();
  }

  async resetStats(): Promise<void> {
    this.history.set({});
    await this.host.resetStats();
  }
}

/** Time until just after the next local midnight. */
function msUntilTomorrow(now: number): number {
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 1, 0);
  return tomorrow.getTime() - now;
}
