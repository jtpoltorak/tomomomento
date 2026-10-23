import {
  addFocusMinutes,
  bestDaypart,
  daypartOf,
  driftWeeks,
  recordDrift,
  energyByDaypart,
  energyWord,
  recordEnergy,
  formatMinutes,
  heatLevel,
  heatmap,
  lastDays,
  recordPomodoro,
  sanitizeHistory,
  seedHistory,
  summarize,
  weekLookBack,
} from './stats';
import { DEFAULT_SETTINGS, initialState, localDateKey } from './timer';

describe('stats', () => {
  // Tuesday, Oct 13 2026, mid-afternoon local time.
  const NOW = new Date(2026, 9, 13, 15, 0, 0).getTime();
  const day = (m: number, d: number) => new Date(2026, m - 1, d, 12).getTime();

  it('records a pomodoro on the day it finished', () => {
    let h = recordPomodoro({}, day(10, 13), 25);
    h = recordPomodoro(h, day(10, 13), 25);
    h = recordPomodoro(h, day(10, 12), 50);
    expect(h).toEqual({
      '2026-10-13': { pomodoros: 2, focusMinutes: 50 },
      '2026-10-12': { pomodoros: 1, focusMinutes: 50 },
    });
  });

  it('adds extra focus minutes to a day without another pomodoro', () => {
    const h = recordPomodoro({}, day(10, 13), 25);
    expect(addFocusMinutes(h, day(10, 13), 5)).toEqual({
      '2026-10-13': { pomodoros: 1, focusMinutes: 30 },
    });
    // A day with no pomodoros isn't started by extra time alone.
    expect(addFocusMinutes(h, day(10, 14), 5)).toBe(h);
  });

  it("carries today's tally over into a first history", () => {
    const state = { ...initialState(DEFAULT_SETTINGS, NOW), completedToday: 3 };
    expect(seedHistory(state, DEFAULT_SETTINGS)).toEqual({
      [localDateKey(NOW)]: { pomodoros: 3, focusMinutes: 75 },
    });
    expect(seedHistory(initialState(DEFAULT_SETTINGS, NOW), DEFAULT_SETTINGS)).toEqual({});
  });

  it('drops malformed entries', () => {
    expect(
      sanitizeHistory({
        '2026-10-13': { pomodoros: 2, focusMinutes: 50 },
        '2026-10-12': { pomodoros: 0, focusMinutes: 0 },
        nope: { pomodoros: 1, focusMinutes: 25 },
        '2026-10-11': 'x',
        '2026-10-10': { pomodoros: 1 },
      }),
    ).toEqual({
      '2026-10-13': { pomodoros: 2, focusMinutes: 50 },
      '2026-10-10': { pomodoros: 1, focusMinutes: 0 },
    });
    expect(sanitizeHistory(null)).toEqual({});
  });

  it('sums today, the last 7 days, this month, and all time', () => {
    const h = {
      '2026-10-13': { pomodoros: 2, focusMinutes: 50 },
      '2026-10-07': { pomodoros: 4, focusMinutes: 100 }, // 6 days ago: in the last 7
      '2026-10-06': { pomodoros: 1, focusMinutes: 25 }, // 7 days ago: out
      '2026-09-30': { pomodoros: 5, focusMinutes: 125 }, // last month
    };
    expect(summarize(h, NOW)).toEqual({
      today: { pomodoros: 2, focusMinutes: 50 },
      last7Days: { pomodoros: 6, focusMinutes: 150 },
      thisMonth: { pomodoros: 7, focusMinutes: 175 },
      allTime: { pomodoros: 12, focusMinutes: 300 },
    });
  });

  it('lists the last 7 days oldest first, ending today', () => {
    const days = lastDays({ '2026-10-13': { pomodoros: 2, focusMinutes: 50 } }, NOW, 7);
    expect(days.map((d) => d.key)).toEqual([
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
    ]);
    expect(days.map((d) => d.pomodoros)).toEqual([0, 0, 0, 0, 0, 0, 2]);
  });

  it('crosses a daylight saving change without skipping a day', () => {
    // US clocks go back on Nov 1 2026; every key appears exactly once either way.
    const keys = lastDays({}, new Date(2026, 10, 4, 0, 30).getTime(), 7).map((d) => d.key);
    expect(new Set(keys).size).toBe(7);
    expect(keys.at(-1)).toBe('2026-11-04');
  });

  it('lays out the heat map in Monday-first weeks ending this week', () => {
    // Thursday, Oct 15 2026: Fri to Sun of this week are still to come.
    const weeks = heatmap({}, day(10, 15), 16);
    expect(weeks).toHaveLength(16);
    expect(weeks[0].days[0]!.key).toBe('2026-06-29');
    expect(weeks[0].days[0]!.date.getDay()).toBe(1);
    const last = weeks.at(-1)!.days;
    expect(last.map((d) => d?.key ?? null)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      null,
      null,
      null,
    ]);
    expect(weeks.map((w) => w.month).filter(Boolean)).toEqual(['Jul', 'Aug', 'Sep', 'Oct']);
  });

  it('shades on a fixed scale and formats focus time', () => {
    expect([0, 1, 2, 3, 4, 5, 7, 8, 20].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect([0, 45, 60, 125].map(formatMinutes)).toEqual(['0m', '45m', '1h', '2h 5m']);
  });

  describe('energy check-ins', () => {
    const at = (hour: number) => new Date(2026, 9, 13, hour, 10).getTime();
    const base = recordPomodoro({}, at(9), 25);

    it('sorts the hours into times of day', () => {
      expect([4, 5, 11, 12, 16, 17, 21, 22].map((h) => daypartOf(at(h)))).toEqual([
        'night',
        'morning',
        'morning',
        'afternoon',
        'afternoon',
        'evening',
        'evening',
        'night',
      ]);
    });

    it('tallies check-ins on the day, and keeps them as pomodoros are added', () => {
      let h = recordEnergy(base, at(9), 3);
      h = recordEnergy(h, at(10), 2);
      h = recordPomodoro(h, at(11), 25);
      expect(h['2026-10-13'].energy).toEqual({ morning: { sum: 5, count: 2 } });
      expect(recordEnergy({}, at(9), 3)).toEqual({});
      expect(sanitizeHistory(h)).toEqual(h);
    });

    it('needs a few check-ins before it says anything', () => {
      let h = base;
      for (const level of [3, 3, 2] as const) h = recordEnergy(h, at(9), level);
      for (const level of [1, 2] as const) h = recordEnergy(h, at(14), level);
      let rows = energyByDaypart(h);
      expect(rows.map((r) => r.average)).toEqual([8 / 3, null, null, null]);
      expect(bestDaypart(rows)).toBeNull(); // only mornings know enough

      h = recordEnergy(h, at(14), 1);
      rows = energyByDaypart(h);
      expect(bestDaypart(rows)?.label).toBe('Morning');
      expect(energyWord(8 / 3)).toBe('Great');
      expect(energyWord(4 / 3)).toBe('Low');
    });
  });

  it('looks back on last week, Monday to Sunday', () => {
    // NOW is Tuesday Oct 13; last week ran Mon Oct 5 to Sun Oct 11.
    let h = recordPomodoro({}, day(10, 4), 25); // the week before: left out
    h = recordPomodoro(h, day(10, 7), 25);
    h = recordPomodoro(h, day(10, 7), 25);
    h = recordPomodoro(h, day(10, 11), 50);
    h = recordPomodoro(h, day(10, 12), 25); // this week: left out
    const back = weekLookBack(h, NOW)!;
    expect(back.week).toBe('2026-10-12');
    expect(back.totals).toEqual({ pomodoros: 3, focusMinutes: 100 });
    expect(back.best.key).toBe('2026-10-07');
    expect(weekLookBack({}, NOW)).toBeNull();
  });

  it('counts drifts per day and compares this week with last', () => {
    let h = recordDrift({}, day(10, 13)); // a day with no pomodoros yet
    h = recordDrift(h, day(10, 13));
    expect(h['2026-10-13']).toEqual({ pomodoros: 0, focusMinutes: 0, drifts: 2 });
    h = recordPomodoro(h, day(10, 13), 25);
    expect(h['2026-10-13']).toEqual({ pomodoros: 1, focusMinutes: 25, drifts: 2 });
    h = recordDrift(h, day(10, 6));
    h = recordPomodoro(h, day(10, 6), 25);
    expect(driftWeeks(h, NOW)).toEqual({
      thisWeek: { drifts: 2, pomodoros: 1 },
      lastWeek: { drifts: 1, pomodoros: 1 },
    });
    // A day with drifts but no pomodoros survives a reload.
    expect(sanitizeHistory({ '2026-10-14': { pomodoros: 0, focusMinutes: 0, drifts: 3 } })).toEqual(
      {
        '2026-10-14': { pomodoros: 0, focusMinutes: 0, drifts: 3 },
      },
    );
  });
});
