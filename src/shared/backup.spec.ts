import {
  applyBackup,
  backupFileName,
  createBackup,
  mergeHistory,
  mergeParkingLot,
  parseBackup,
  type BackupData,
} from './backup';
import { EMPTY_PARKING_LOT } from './parking';
import { EMPTY_PLAN_DATA } from './plan';
import { DEFAULT_SETTINGS } from './timer';

const NOW = new Date(2026, 9, 14, 9, 30).getTime();
const TODAY = '2026-10-14';

function data(overrides: Partial<BackupData> = {}): BackupData {
  return {
    settings: DEFAULT_SETTINGS,
    history: {},
    plan: EMPTY_PLAN_DATA,
    parkingLot: EMPTY_PARKING_LOT,
    ...overrides,
  };
}

describe('backup', () => {
  it('round-trips through JSON', () => {
    const original = data({
      settings: { ...DEFAULT_SETTINGS, workMinutes: 40, breakIdeas: true },
      history: { '2026-10-13': { pomodoros: 5, focusMinutes: 125 } },
      parkingLot: { thoughts: [{ id: 'a', text: 'Buy milk', at: 5 }], seenAt: 1 },
    });
    const parsed = parseBackup(JSON.stringify(createBackup(original, NOW)));
    expect(parsed.ok && parsed.data).toEqual(original);
    expect(parsed.ok && parsed.exportedAt?.getTime()).toBe(NOW);
  });

  it('names the file after the day', () => {
    expect(backupFileName(NOW)).toBe('tomomomento-backup-2026-10-14.json');
  });

  it('turns away files that are not backups, or are from a newer version', () => {
    expect(parseBackup('not json')).toEqual({
      ok: false,
      error: "That file isn't a Tomomomento backup.",
    });
    expect(parseBackup('{"app":"other"}').ok).toBe(false);
    const newer = parseBackup('{"app":"tomomomento","version":99}');
    expect(!newer.ok && newer.error).toMatch(/newer version/);
  });

  it('fills in anything a backup is missing', () => {
    const parsed = parseBackup('{"app":"tomomomento","version":1,"settings":{"workMinutes":999}}');
    expect(parsed.ok && parsed.data.settings.workMinutes).toBe(180);
    expect(parsed.ok && parsed.data.history).toEqual({});
  });

  it('keeps the bigger day when combining stats', () => {
    expect(
      mergeHistory(
        { a: { pomodoros: 3, focusMinutes: 75 }, b: { pomodoros: 1, focusMinutes: 25 } },
        {
          b: { pomodoros: 4, focusMinutes: 100 },
          c: { pomodoros: 2, focusMinutes: 50 },
          a: { pomodoros: 1, focusMinutes: 25 },
        },
      ),
    ).toEqual({
      a: { pomodoros: 3, focusMinutes: 75 },
      b: { pomodoros: 4, focusMinutes: 100 },
      c: { pomodoros: 2, focusMinutes: 50 },
    });
  });

  it('combines parked thoughts without duplicates, oldest first', () => {
    const merged = mergeParkingLot(
      { thoughts: [{ id: 'b', text: 'B', at: 2 }], seenAt: 9 },
      {
        thoughts: [
          { id: 'a', text: 'A', at: 1 },
          { id: 'b', text: 'B', at: 2 },
        ],
        seenAt: 0,
      },
    );
    expect(merged.thoughts.map((t) => t.id)).toEqual(['a', 'b']);
    expect(merged.seenAt).toBe(9);
  });

  it('keeps permission switches and a plan made today', () => {
    const todayPlan = {
      plan: { date: TODAY, pomodoros: 3, labels: [] },
      lastCount: 3,
      skippedOn: null,
    };
    const current = data({
      settings: { ...DEFAULT_SETTINGS, blockSites: true },
      plan: todayPlan,
    });
    const incoming = data({
      settings: { ...DEFAULT_SETTINGS, blockSites: false, workMinutes: 50 },
      plan: {
        plan: { date: '2026-10-01', pomodoros: 8, labels: [] },
        lastCount: 8,
        skippedOn: null,
      },
    });
    const next = applyBackup(current, incoming, ['blockSites'], TODAY);
    expect(next.settings.workMinutes).toBe(50);
    expect(next.settings.blockSites).toBe(true);
    expect(next.plan).toBe(todayPlan);
  });
});
