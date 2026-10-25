import { earnedStickers, newSticker, STICKERS } from './stickers';

describe('stickers', () => {
  it('earns nothing with no history', () => {
    expect(earnedStickers({})).toEqual([]);
  });

  it('works out milestones from the history', () => {
    const earned = earnedStickers({
      // Saturday, Oct 10 2026.
      '2026-10-10': { pomodoros: 8, focusMinutes: 200 },
      '2026-10-12': { pomodoros: 3, focusMinutes: 75, drifts: 2 },
    });
    expect(earned).toEqual(['first', 'p10', 'big-day', 'weekend', 'noticed']);
  });

  it('counts focus days and hours', () => {
    const history = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [
        `2026-09-${String(i + 1).padStart(2, '0')}`,
        { pomodoros: 1, focusMinutes: 30 },
      ]),
    );
    const earned = earnedStickers(history);
    expect(earned).toContain('days5');
    expect(earned).toContain('days20');
    expect(earned).toContain('hours10');
    expect(earned).not.toContain('hours50');
  });

  it('shows the newest sticker not seen yet', () => {
    expect(newSticker(['first', 'p10'], ['first'])?.id).toBe('p10');
    expect(newSticker(['first', 'p10'], ['first', 'p10'])).toBeNull();
    expect(newSticker([], [])).toBeNull();
  });

  it('has a unique id for every sticker', () => {
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
  });
});
