import { TestBed } from '@angular/core/testing';
import type { History } from '../../../shared/stats';
import { localDateKey } from '../../../shared/timer';
import { createFakeStore, provideFakeStore } from '../testing';
import { StatsView } from './stats-view';

async function setup(history: History = {}) {
  const store = createFakeStore({}, history);
  TestBed.configureTestingModule({ imports: [StatsView], providers: [provideFakeStore(store)] });
  const fixture = TestBed.createComponent(StatsView);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  return { store, fixture, el, button };
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return localDateKey(d.getTime());
};

describe('StatsView', () => {
  it('shows totals, the last 7 days, and the heat map', async () => {
    const { el } = await setup({
      [daysAgo(0)]: { pomodoros: 3, focusMinutes: 75 },
      [daysAgo(2)]: { pomodoros: 6, focusMinutes: 150 },
    });
    const tiles = Array.from(el.querySelectorAll('.tile')).map((t) =>
      Array.from(t.children, (c) => c.textContent!.trim()).join(' '),
    );
    expect(tiles[0]).toBe('Today 3 1h 15m focused');
    expect(tiles[1]).toBe('Last 7 days 9 3h 45m focused');
    expect(tiles[3]).toBe('All time 9 3h 45m focused');

    const bars = el.querySelectorAll('.bars li');
    expect(bars).toHaveLength(7);
    expect(bars[6].querySelector('.day')?.textContent?.trim()).toBe('Today');
    expect(bars[6].querySelector('.visually-hidden')?.textContent).toContain('3 pomodoros');

    const map = el.querySelector('.heatmap')!;
    expect(map.getAttribute('role')).toBe('img');
    expect(map.getAttribute('aria-label')).toMatch(
      /^2 days with focus in the last 16 weeks\. Best day: .+, 6 pomodoros\.$/,
    );
    expect(map.querySelectorAll('.cell[data-level="3"]')).toHaveLength(1);
    expect(map.querySelectorAll('.cell.today')).toHaveLength(1);
  });

  it('has a friendly empty state', async () => {
    const { el } = await setup();
    expect(el.querySelector('.note')?.textContent).toContain('Finish a focus session');
    expect(el.querySelector('.heatmap')?.getAttribute('aria-label')).toBe(
      'No focus sessions in the last 16 weeks yet.',
    );
  });

  it('asks before clearing the stats', async () => {
    const { store, fixture, button } = await setup({
      [daysAgo(0)]: { pomodoros: 1, focusMinutes: 25 },
    });
    button('Reset stats')!.click();
    await fixture.whenStable();
    expect(document.activeElement?.textContent?.trim()).toBe('Cancel');
    button('Cancel')!.click();
    await fixture.whenStable();
    expect(store.history()).not.toEqual({});

    button('Reset stats')!.click();
    await fixture.whenStable();
    button('Clear stats')!.click();
    await fixture.whenStable();
    expect(store.history()).toEqual({});
    expect(button('Reset stats')).toBeTruthy();
  });
});
