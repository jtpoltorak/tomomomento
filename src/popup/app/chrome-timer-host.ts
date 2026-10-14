import type { BackupData } from '../../shared/backup';
import { BLOCKER_PERMISSIONS } from '../../shared/blocker';
import { sendCommand, type Command, type CommandResponse } from '../../shared/messages';
import type { ParkingLot } from '../../shared/parking';
import type { PlanData } from '../../shared/plan';
import {
  loadHistory,
  loadParkingLot,
  loadPlan,
  loadSettings,
  loadState,
  saveHistory,
  saveParkingLot,
  savePlanData,
  saveSettings,
} from '../../shared/storage';
import type { Settings } from '../../shared/timer';
import type { HostSnapshot, TimerHost } from './timer-host';

const HINT_KEY = 'alertHintDismissed';

/** The extension popup's host: the background worker owns the timer, chrome.storage holds it. */
export class ChromeTimerHost implements TimerHost {
  async load(): Promise<HostSnapshot> {
    const [state, settings, ui, blockerAccess, history, plan, parkingLot] = await Promise.all([
      loadState(),
      loadSettings(),
      chrome.storage.local.get(HINT_KEY),
      chrome.permissions.contains(BLOCKER_PERMISSIONS),
      loadHistory(),
      loadPlan(),
      loadParkingLot(),
    ]);
    return {
      state,
      settings,
      alertHintDismissed: Boolean(ui[HINT_KEY]),
      blockerAccess,
      history,
      plan,
      parkingLot,
    };
  }

  onChange(listener: () => void): () => void {
    const onChanged = () => listener();
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }

  send(command: Command): Promise<CommandResponse> {
    return sendCommand(command);
  }

  saveSettings(settings: Settings): Promise<void> {
    return saveSettings(settings);
  }

  requestBlockerAccess(): Promise<boolean> {
    return chrome.permissions.request(BLOCKER_PERMISSIONS);
  }

  /** The extension asks for notifications at install time. */
  async requestNotificationAccess(): Promise<boolean> {
    return true;
  }

  async dismissAlertHint(): Promise<void> {
    await chrome.storage.local.set({ [HINT_KEY]: true });
  }

  resetStats(): Promise<void> {
    return saveHistory({});
  }

  savePlan(plan: PlanData): Promise<void> {
    return savePlanData(plan);
  }

  saveParkingLot(lot: ParkingLot): Promise<void> {
    return saveParkingLot(lot);
  }

  async restoreData(data: BackupData): Promise<void> {
    await Promise.all([
      saveSettings(data.settings),
      saveHistory(data.history),
      savePlanData(data.plan),
      saveParkingLot(data.parkingLot),
    ]);
  }

  /** The popup has no tab of its own; Settings opened as a page does. */
  async needsTabForFiles(): Promise<boolean> {
    return (await chrome.tabs.getCurrent()) === undefined;
  }

  async openSettingsTab(): Promise<void> {
    await chrome.runtime.openOptionsPage();
  }
}
