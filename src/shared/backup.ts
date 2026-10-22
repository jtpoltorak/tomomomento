// Back up and restore: everything worth keeping, in one JSON file the user
// saves wherever they like. Nothing is uploaded anywhere. Pure functions only.

import { MAX_THOUGHTS, sanitizeParkingLot, type ParkingLot, type Thought } from './parking';
import { planFor, sanitizePlanData, type PlanData } from './plan';
import { sanitizeHistory, type History } from './stats';
import { DEFAULT_SETTINGS, localDateKey, sanitizeSettings, type Settings } from './timer';

export const BACKUP_APP = 'tomomomento';
export const BACKUP_VERSION = 1;

export interface BackupData {
  settings: Settings;
  history: History;
  plan: PlanData;
  parkingLot: ParkingLot;
}

export interface BackupFile extends BackupData {
  app: typeof BACKUP_APP;
  version: number;
  /** ISO time the backup was made. */
  exportedAt: string;
}

export type ParsedBackup =
  { ok: true; data: BackupData; exportedAt: Date | null } | { ok: false; error: string };

export function createBackup(data: BackupData, now: number): BackupFile {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    settings: data.settings,
    history: data.history,
    plan: data.plan,
    parkingLot: data.parkingLot,
  };
}

/** "tomomomento-backup-2026-10-14.json". */
export function backupFileName(now: number): string {
  return `${BACKUP_APP}-backup-${localDateKey(now)}.json`;
}

/** Reads a backup file's text. Anything missing or malformed falls back to empty or default. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't a Tomomomento backup." };
  }
  if (!raw || typeof raw !== 'object' || (raw as { app?: unknown }).app !== BACKUP_APP) {
    return { ok: false, error: "That file isn't a Tomomomento backup." };
  }
  const file = raw as Partial<Record<keyof BackupFile, unknown>>;
  if (Number(file.version) > BACKUP_VERSION) {
    return {
      ok: false,
      error: 'That backup is from a newer version of Tomomomento. Update this one, then try again.',
    };
  }
  const settings =
    file.settings && typeof file.settings === 'object'
      ? sanitizeSettings({ ...DEFAULT_SETTINGS, ...(file.settings as Partial<Settings>) })
      : DEFAULT_SETTINGS;
  const exportedAt = typeof file.exportedAt === 'string' ? new Date(file.exportedAt) : null;
  return {
    ok: true,
    data: {
      settings,
      history: sanitizeHistory(file.history ?? {}),
      plan: sanitizePlanData(file.plan),
      parkingLot: sanitizeParkingLot(file.parkingLot),
    },
    exportedAt: exportedAt && Number.isFinite(exportedAt.getTime()) ? exportedAt : null,
  };
}

/** Per day, keeps whichever side has more pomodoros, so restoring never loses a day. */
export function mergeHistory(current: History, incoming: History): History {
  const out: History = { ...current };
  for (const [day, stats] of Object.entries(incoming)) {
    const mine = out[day];
    if (
      !mine ||
      stats.pomodoros > mine.pomodoros ||
      (stats.pomodoros === mine.pomodoros && stats.focusMinutes > mine.focusMinutes)
    ) {
      out[day] = stats;
    }
  }
  return out;
}

/** Thoughts from both, oldest first, without duplicates. */
export function mergeParkingLot(current: ParkingLot, incoming: ParkingLot): ParkingLot {
  const byId = new Map<string, Thought>();
  for (const t of [...incoming.thoughts, ...current.thoughts]) byId.set(t.id, t);
  const thoughts = [...byId.values()].sort((a, b) => a.at - b.at).slice(-MAX_THOUGHTS);
  return { ...current, thoughts };
}

/**
 * What this device ends up with after restoring `incoming`. Settings come from
 * the backup, except switches that need this browser's permission, which stay
 * as they are here. Stats and parked thoughts are combined, and a plan already
 * made today is kept.
 */
export function applyBackup(
  current: BackupData,
  incoming: BackupData,
  keep: readonly (keyof Settings)[],
  today: string,
): BackupData {
  const settings = { ...incoming.settings };
  for (const key of keep) (settings as Record<string, unknown>)[key] = current.settings[key];
  return {
    settings: sanitizeSettings(settings),
    history: mergeHistory(current.history, incoming.history),
    plan: planFor(current.plan, today) ? current.plan : incoming.plan,
    parkingLot: mergeParkingLot(current.parkingLot, incoming.parkingLot),
  };
}
