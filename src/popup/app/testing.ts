import { computed, signal } from '@angular/core';
import {
  DEFAULT_SETTINGS,
  initialState,
  phaseDurationMs,
  remainingMs,
  type Settings,
  type TimerState,
} from '../../shared/timer';
import type { Command } from '../../shared/messages';
import { applyBackup, type BackupData } from '../../shared/backup';
import {
  clearThoughts,
  EMPTY_PARKING_LOT,
  markSeen,
  parkThought,
  removeThought,
  unseenCount,
  type ParkingLot,
} from '../../shared/parking';
import { clearPlan, EMPTY_PLAN_DATA, planFor, savePlan, type PlanData } from '../../shared/plan';
import type { History } from '../../shared/stats';
import { PomodoroStore } from './pomodoro-store';

/** A PomodoroStore stand-in with no chrome.* calls, for component tests. */
export function createFakeStore(overrides: Partial<TimerState> = {}, history: History = {}) {
  const now = Date.now();
  const state = signal<TimerState>({ ...initialState(DEFAULT_SETTINGS, now), ...overrides });
  const settings = signal<Settings>(DEFAULT_SETTINGS);
  const sent: Command[] = [];
  const plan = signal<PlanData>(EMPTY_PLAN_DATA);
  const todayPlan = computed(() =>
    settings().planEnabled ? planFor(plan(), state().todayKey) : null,
  );
  const parkingLot = signal<ParkingLot>(EMPTY_PARKING_LOT);
  let nextId = 1;
  const fake = {
    state,
    settings,
    loaded: signal(true),
    alertHintDismissed: signal(false),
    blockerAccess: signal(false),
    history: signal<History>(history),
    plan,
    todayPlan,
    showPlanPrompt: computed(() => {
      const s = settings();
      return s.planEnabled && s.planPrompt && !todayPlan() && plan().skippedOn !== state().todayKey;
    }),
    parkingLot,
    parkedCount: computed(() => (settings().parkingLot ? parkingLot().thoughts.length : 0)),
    parkedOnBreak: computed(() =>
      settings().parkingLot && state().phase !== 'work' ? unseenCount(parkingLot()) : 0,
    ),
    remainingMs: computed(() => remainingMs(state(), now)),
    totalMs: computed(() => phaseDurationMs(state().phase, settings())),
    progress: computed(() => 0),
    alertsOff: computed(() => !settings().soundEnabled && !settings().notificationsEnabled),
    sent,
    async send(command: Command) {
      sent.push(command);
    },
    async updateSettings(next: Settings) {
      settings.set(next);
    },
    /** Tests set this to decide how the permission prompt is answered. */
    grantBlockerAccess: true,
    async requestBlockerAccess() {
      fake.blockerAccess.set(fake.grantBlockerAccess);
      return fake.grantBlockerAccess;
    },
    /** Tests set this to decide how the notification prompt is answered. */
    grantNotificationAccess: true,
    async requestNotificationAccess() {
      return fake.grantNotificationAccess;
    },
    async dismissAlertHint() {
      fake.alertHintDismissed.set(true);
    },
    async resetStats() {
      fake.history.set({});
    },
    async savePlan(pomodoros: number, labels: readonly string[]) {
      fake.plan.set(savePlan(fake.plan(), state().todayKey, pomodoros, labels));
    },
    async clearPlan() {
      fake.plan.set(clearPlan(fake.plan()));
    },
    async parkThought(text: string) {
      parkingLot.set(parkThought(parkingLot(), text, Date.now(), `t${nextId++}`));
    },
    async removeThought(id: string) {
      parkingLot.set(removeThought(parkingLot(), id));
    },
    async clearThoughts() {
      parkingLot.set(clearThoughts(parkingLot()));
    },
    async markParkingSeen() {
      parkingLot.set(markSeen(parkingLot(), Date.now()));
    },
    backupData(): BackupData {
      return {
        settings: settings(),
        history: fake.history(),
        plan: plan(),
        parkingLot: parkingLot(),
      };
    },
    async restoreBackup(incoming: BackupData, keep: readonly (keyof Settings)[]) {
      const next = applyBackup(fake.backupData(), incoming, keep, state().todayKey);
      settings.set(next.settings);
      fake.history.set(next.history);
      plan.set(next.plan);
      parkingLot.set(next.parkingLot);
      return next.settings;
    },
    /** Tests set this to act like the extension popup. */
    inPopup: false,
    openedTab: 0,
    async needsTabForFiles() {
      return fake.inPopup;
    },
    async openSettingsTab() {
      fake.openedTab++;
    },
    async skipPlanToday() {
      fake.plan.set({ ...fake.plan(), skippedOn: state().todayKey });
    },
  };
  return fake;
}

export function provideFakeStore(fake: ReturnType<typeof createFakeStore>) {
  return { provide: PomodoroStore, useValue: fake };
}
