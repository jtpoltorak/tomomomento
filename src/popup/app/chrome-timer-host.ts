import { BLOCKER_PERMISSIONS } from '../../shared/blocker';
import { sendCommand, type Command, type CommandResponse } from '../../shared/messages';
import type { PlanData } from '../../shared/plan';
import {
  loadHistory,
  loadPlan,
  loadSettings,
  loadState,
  saveHistory,
  savePlanData,
  saveSettings,
} from '../../shared/storage';
import type { Settings } from '../../shared/timer';
import type { HostSnapshot, TimerHost } from './timer-host';

const HINT_KEY = 'alertHintDismissed';

/** The extension popup's host: the background worker owns the timer, chrome.storage holds it. */
export class ChromeTimerHost implements TimerHost {
  async load(): Promise<HostSnapshot> {
    const [state, settings, ui, blockerAccess, history, plan] = await Promise.all([
      loadState(),
      loadSettings(),
      chrome.storage.local.get(HINT_KEY),
      chrome.permissions.contains(BLOCKER_PERMISSIONS),
      loadHistory(),
      loadPlan(),
    ]);
    return {
      state,
      settings,
      alertHintDismissed: Boolean(ui[HINT_KEY]),
      blockerAccess,
      history,
      plan,
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
}
