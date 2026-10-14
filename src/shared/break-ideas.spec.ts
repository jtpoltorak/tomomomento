import { breakIdea, LONG_BREAK_IDEAS, SHORT_BREAK_IDEAS } from './break-ideas';

describe('breakIdea', () => {
  it('has nothing to suggest during focus', () => {
    expect(breakIdea('work', 'seed')).toBeNull();
  });

  it('picks from the list that fits the break', () => {
    expect(SHORT_BREAK_IDEAS).toContain(breakIdea('shortBreak', 'a'));
    expect(LONG_BREAK_IDEAS).toContain(breakIdea('longBreak', 'a'));
  });

  it('gives the same idea for the same break, and a new one when asked', () => {
    const first = breakIdea('shortBreak', '2026-10-14:3:shortBreak');
    expect(breakIdea('shortBreak', '2026-10-14:3:shortBreak')).toBe(first);
    const seen = new Set(
      SHORT_BREAK_IDEAS.map((_, i) => breakIdea('shortBreak', '2026-10-14:3:shortBreak', i)),
    );
    expect(seen.size).toBe(SHORT_BREAK_IDEAS.length);
  });

  it('keeps every idea short enough for one line under the clock', () => {
    for (const idea of [...SHORT_BREAK_IDEAS, ...LONG_BREAK_IDEAS]) {
      expect(idea.length).toBeLessThanOrEqual(34);
    }
  });
});
