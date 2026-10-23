import { InjectionToken } from '@angular/core';
import type { BackupData } from '../../shared/backup';
import type { Command, CommandResponse } from '../../shared/messages';
import type { ParkingLot } from '../../shared/parking';
import type { PlanData } from '../../shared/plan';
import type { History } from '../../shared/stats';
import type { Settings, TimerState } from '../../shared/timer';

/** Which build the UI is running in. A few labels and settings differ between them. */
export type PlatformKind = 'extension' | 'web';

export const PLATFORM = new InjectionToken<PlatformKind>('PLATFORM', {
  providedIn: 'root',
  factory: () => 'extension',
});

export interface HostSnapshot {
  state: TimerState;
  settings: Settings;
  alertHintDismissed: boolean;
  /** Whether the "Try these" card for optional helpers was answered. */
  helpersTipDismissed: boolean;
  /** Whether the user has granted the site access the blocker needs. */
  blockerAccess: boolean;
  /** Finished focus sessions per day, for the Stats screen. */
  history: History;
  /** Today's plan for "Plan my day". */
  plan: PlanData;
  /** Thoughts parked during focus. */
  parkingLot: ParkingLot;
}

/**
 * Where the timer actually runs. The UI only talks to this, so the same
 * components work in the extension popup (backed by the background worker
 * and chrome.storage) and on the web (backed by an in-page engine and
 * localStorage).
 */
export interface TimerHost {
  load(): Promise<HostSnapshot>;
  /** Calls `listener` whenever the stored timer or settings change. Returns an unsubscribe. */
  onChange(listener: () => void): () => void;
  send(command: Command): Promise<CommandResponse>;
  saveSettings(settings: Settings): Promise<void>;
  /** Must be called straight from a click, since browsers only prompt on a user gesture. */
  requestBlockerAccess(): Promise<boolean>;
  /** Must be called straight from a click, since browsers only prompt on a user gesture. */
  requestNotificationAccess(): Promise<boolean>;
  dismissAlertHint(): Promise<void>;
  dismissHelpersTip(): Promise<void>;
  /** Clears the Stats history. The timer and today's tally on it are left alone. */
  resetStats(): Promise<void>;
  savePlan(plan: PlanData): Promise<void>;
  saveParkingLot(lot: ParkingLot): Promise<void>;
  /** Replaces settings, stats, plan and parked thoughts in one go, for restoring a backup. */
  restoreData(data: BackupData): Promise<void>;
  /**
   * True when picking a file has to happen somewhere else: Chrome closes the
   * extension popup as soon as the file chooser opens.
   */
  needsTabForFiles(): Promise<boolean>;
  /** Opens Settings in a full browser tab. */
  openSettingsTab(): Promise<void>;
  /**
   * Opens the big timer in a full browser tab when there's no room for it here
   * (the extension popup). Resolves true if it did, false to show it in place.
   */
  openBigTimer(): Promise<boolean>;
}

export const TIMER_HOST = new InjectionToken<TimerHost>('TimerHost');
