import {
  cleanLabels,
  clearPlan,
  EMPTY_PLAN_DATA,
  isAfterToday,
  planDoneMessage,
  planFor,
  planSchedule,
  sanitizePlanData,
  savePlan,
} from './plan';
import { DEFAULT_SETTINGS, initialState, localDateKey, type TimerState } from './timer';

const MIN = 60_000;
const NOW = new Date(2026, 9, 13, 9, 40).getTime();
const TODAY = localDateKey(NOW);

function state(overrides: Partial<TimerState> = {}): TimerState {
  return { ...initialState(DEFAULT_SETTINGS, NOW), ...overrides };
}

describe('planSchedule', () => {
  it('lays out focus and breaks with a long break after every fourth', () => {
    const { blocks, endsAt } = planSchedule(6, state(), DEFAULT_SETTINGS, NOW);
    expect(blocks.map((b) => b.phase)).toEqual([
      'work',
      'shortBreak',
      'work',
      'shortBreak',
      'work',
      'shortBreak',
      'work',
      'longBreak',
      'work',
      'shortBreak',
      'work',
    ]);
    // 6 × 25 + 4 × 5 + 15 = 185 minutes, so 12:45 PM.
    expect(endsAt - NOW).toBe(185 * MIN);
  });

  it('counts the running focus session with the time it has left', () => {
    const running = state({ status: 'running', endTime: NOW + 10 * MIN, completedInCycle: 3 });
    const { blocks, endsAt } = planSchedule(2, running, DEFAULT_SETTINGS, NOW);
    // This one finishes the cycle, so a long break comes next.
    expect(blocks.map((b) => [b.phase, b.ms / MIN])).toEqual([
      ['work', 10],
      ['longBreak', 15],
      ['work', 25],
    ]);
    expect(endsAt - NOW).toBe(50 * MIN);
  });

  it('puts "Keep going" time ahead of the plan, without using up a pomodoro', () => {
    const extra = state({
      status: 'running',
      endTime: NOW + 3 * MIN,
      remainingMs: 5 * MIN,
      completedInCycle: 1,
      phaseMs: 5 * MIN,
      extending: true,
    });
    const { blocks } = planSchedule(1, extra, DEFAULT_SETTINGS, NOW);
    expect(blocks.map((b) => [b.phase, b.ms / MIN])).toEqual([
      ['work', 3],
      ['shortBreak', 5],
      ['work', 25],
    ]);
  });

  it('starts with what is left of a break', () => {
    const onBreak = state({ phase: 'shortBreak', remainingMs: 3 * MIN, completedInCycle: 1 });
    const { blocks } = planSchedule(1, onBreak, DEFAULT_SETTINGS, NOW);
    expect(blocks.map((b) => [b.phase, b.ms / MIN])).toEqual([
      ['shortBreak', 3],
      ['work', 25],
    ]);
  });

  it('is empty when nothing is left to plan', () => {
    expect(planSchedule(0, state(), DEFAULT_SETTINGS, NOW)).toEqual({ blocks: [], endsAt: NOW });
  });
});

describe('plan data', () => {
  it('only counts a plan on the day it was made for', () => {
    const data = savePlan(EMPTY_PLAN_DATA, TODAY, 6, []);
    expect(planFor(data, TODAY)?.pomodoros).toBe(6);
    expect(planFor(data, '2026-10-14')).toBeNull();
    expect(data.lastCount).toBe(6);
  });

  it('keeps the last count when a plan is cleared', () => {
    const data = clearPlan(savePlan(EMPTY_PLAN_DATA, TODAY, 3, []));
    expect(data.plan).toBeNull();
    expect(data.lastCount).toBe(3);
  });

  it('clamps the count and trims labels to fit it', () => {
    const data = savePlan(EMPTY_PLAN_DATA, TODAY, 40, []);
    expect(data.plan?.pomodoros).toBe(16);
    expect(cleanLabels(['  Email ', '', 'Report', 'Extra'], 3)).toEqual(['Email', '', 'Report']);
    expect(cleanLabels(['', ' '], 2)).toEqual([]);
    expect(cleanLabels(['x'.repeat(60)], 1)[0]).toHaveLength(40);
  });

  it('survives whatever storage holds', () => {
    expect(sanitizePlanData(undefined)).toEqual(EMPTY_PLAN_DATA);
    expect(sanitizePlanData('nope')).toEqual(EMPTY_PLAN_DATA);
    expect(
      sanitizePlanData({
        plan: { date: TODAY, pomodoros: '5', labels: ['Email', 7] },
        lastCount: 99,
        skippedOn: 'yesterday',
      }),
    ).toEqual({
      plan: { date: TODAY, pomodoros: 5, labels: ['Email', '7', '', '', ''] },
      lastCount: 16,
      skippedOn: null,
    });
    expect(sanitizePlanData({ plan: { date: 'soon', pomodoros: 3 } }).plan).toBeNull();
  });
});

describe('planDoneMessage', () => {
  const data = savePlan(EMPTY_PLAN_DATA, TODAY, 4, []);
  const on = { ...DEFAULT_SETTINGS, planEnabled: true };

  it('celebrates the session that completes the plan, once', () => {
    expect(planDoneMessage(data, on, state({ completedToday: 4 }))).toBe(
      "4 of 4. That's your plan for today.",
    );
    expect(planDoneMessage(data, on, state({ completedToday: 3 }))).toBeNull();
    expect(planDoneMessage(data, on, state({ completedToday: 5 }))).toBeNull();
  });

  it('stays quiet with planning off', () => {
    expect(planDoneMessage(data, DEFAULT_SETTINGS, state({ completedToday: 4 }))).toBeNull();
  });
});

describe('isAfterToday', () => {
  it('spots an estimate that runs past midnight', () => {
    expect(isAfterToday(NOW + 10 * 60 * MIN, NOW)).toBe(false);
    expect(isAfterToday(NOW + 15 * 60 * MIN, NOW)).toBe(true);
  });
});
