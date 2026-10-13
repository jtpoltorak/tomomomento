import {
  formatMinutes,
  heatLevel,
  heatmap,
  lastDays,
  recordPomodoro,
  sanitizeHistory,
  seedHistory,
  summarize,
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
});
