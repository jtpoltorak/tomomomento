import { STARTERS, starterIsOn } from './starters';
import { DEFAULT_SETTINGS, sanitizeSettings } from './timer';

describe('starter setups', () => {
  it('only change settings that exist, with values Settings would keep', () => {
    for (const starter of STARTERS) {
      for (const key of Object.keys(starter.changes)) expect(DEFAULT_SETTINGS).toHaveProperty(key);
      const applied = { ...DEFAULT_SETTINGS, ...starter.changes };
      expect(sanitizeSettings(applied)).toEqual(applied);
    }
  });

  it('know when one is already in place', () => {
    const gentle = STARTERS.find((s) => s.id === 'gentle')!;
    expect(starterIsOn(DEFAULT_SETTINGS, gentle)).toBe(false);
    expect(starterIsOn({ ...DEFAULT_SETTINGS, ...gentle.changes }, gentle)).toBe(true);
  });
});
