import { sanitizeParkingLot, type ParkingLot } from './parking';
import { sanitizePlanData, type PlanData } from './plan';
import { sanitizeHistory, seedHistory, type History } from './stats';
import {
  DEFAULT_SETTINGS,
  initialState,
  sanitizeSettings,
  type Settings,
  type TimerState,
} from './timer';

// Settings live in `sync` so they follow the user across their Chrome profiles.
// Timer state lives in `local` because it changes often and is device-specific.

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.sync.get('settings');
  return sanitizeSettings({ ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) });
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ settings: sanitizeSettings(settings) });
}

export async function loadState(): Promise<TimerState> {
  const { state } = await chrome.storage.local.get('state');
  if (state) return state as TimerState;
  return initialState(await loadSettings(), Date.now());
}

export async function saveState(state: TimerState): Promise<void> {
  await chrome.storage.local.set({ state });
}

/** Days of finished focus sessions, for the Stats screen. Never leaves the device. */
export async function loadHistory(): Promise<History> {
  const { history } = await chrome.storage.local.get('history');
  if (history !== undefined) return sanitizeHistory(history);
  const [state, settings] = await Promise.all([loadState(), loadSettings()]);
  return seedHistory(state, settings);
}

export async function saveHistory(history: History): Promise<void> {
  await chrome.storage.local.set({ history });
}

/** Today's plan, if any, for "Plan my day". Never leaves the device. */
export async function loadPlan(): Promise<PlanData> {
  const { plan } = await chrome.storage.local.get('plan');
  return sanitizePlanData(plan);
}

export async function savePlanData(plan: PlanData): Promise<void> {
  await chrome.storage.local.set({ plan });
}

/** Thoughts in the parking lot. Never leaves the device. */
export async function loadParkingLot(): Promise<ParkingLot> {
  const { parkingLot } = await chrome.storage.local.get('parkingLot');
  return sanitizeParkingLot(parkingLot);
}

export async function saveParkingLot(lot: ParkingLot): Promise<void> {
  await chrome.storage.local.set({ parkingLot: lot });
}
