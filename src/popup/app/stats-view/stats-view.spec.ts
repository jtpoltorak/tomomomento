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
    expect(Array.from(map.querySelectorAll('.weekday'), (d) => d.textContent?.trim())).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
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

  it('shows how each time of day goes, with energy check-ins on', async () => {
    const { el, fixture, store } = await setup({
      [daysAgo(0)]: {
        pomodoros: 6,
        focusMinutes: 150,
        energy: { morning: { sum: 9, count: 3 }, afternoon: { sum: 4, count: 3 } },
      },
    });
    expect(el.querySelector('.energy')).toBeNull();
    store.settings.update((s) => ({ ...s, energyCheck: true }));
    await fixture.whenStable();
    const rows = Array.from(el.querySelectorAll('.energy li')).map((li) =>
      Array.from(li.children)
        .map((c) => c.textContent?.trim())
        .join(' '),
    );
    expect(rows).toEqual([
      'Morning Great 3 check-ins',
      'Afternoon Low 3 check-ins',
      'Evening Not enough yet 0 check-ins',
      'Night Not enough yet 0 check-ins',
    ]);
    expect(el.querySelector('#stats-energy + .energy + .note')?.textContent?.trim()).toBe(
      'Mornings tend to go best for you.',
    );
  });
  it('compares drifts with last week, with the distraction tally on', async () => {
    const { el, fixture, store } = await setup({
      [daysAgo(0)]: { pomodoros: 4, focusMinutes: 100, drifts: 1 },
      [daysAgo(7)]: { pomodoros: 2, focusMinutes: 50, drifts: 3 },
    });
    expect(el.querySelector('#stats-drifts')).toBeNull();
    store.settings.update((s) => ({ ...s, driftTally: true }));
    await fixture.whenStable();
    const rows = Array.from(el.querySelectorAll('#stats-drifts + .energy li')).map((li) =>
      Array.from(li.children)
        .map((c) => c.textContent?.trim())
        .join(' '),
    );
    expect(rows).toEqual(['This week 1 drift in 4 pomodoros', 'Last week 3 drifts in 2 pomodoros']);
    expect(el.querySelector('#stats-drifts + .energy + .note')?.textContent?.trim()).toBe(
      'Fewer drifts per pomodoro than last week.',
    );
  });

  it('grows a plant for each pomodoro this week, with the focus garden on', async () => {
    const { el, fixture, store } = await setup({
      [daysAgo(0)]: { pomodoros: 8, focusMinutes: 200 },
    });
    expect(el.querySelector('#stats-garden')).toBeNull();
    store.settings.update((s) => ({ ...s, focusGarden: true }));
    await fixture.whenStable();
    const today = el.querySelector('.garden li.today')!;
    expect(today.querySelectorAll('.plant').length).toBe(6);
    expect(today.querySelector('.more')?.textContent?.trim()).toBe('+2');
    expect(today.querySelector('.visually-hidden')?.textContent).toContain('8 plants');
    expect(el.querySelectorAll('.garden li').length).toBe(7);
    expect(el.querySelector('#stats-garden ~ .note')?.textContent?.trim()).toBe(
      '8 plants so far this week. A fresh garden every Monday.',
    );
  });

  it('shows the sticker book and counts every sticker as seen', async () => {
    localStorage.removeItem('tomomomento.stickersSeen');
    const { el, fixture, store } = await setup({
      '2026-10-13': { pomodoros: 1, focusMinutes: 25 },
    });
    expect(el.querySelector('#stats-stickers')).toBeNull();
    store.settings.update((s) => ({ ...s, stickerBook: true }));
    await fixture.whenStable();
    const earned = Array.from(el.querySelectorAll('.stickers li.earned .sticker-name')).map((n) =>
      n.textContent?.trim(),
    );
    expect(earned).toEqual(['First one']);
    expect(el.querySelector('#stats-stickers ~ .note')?.textContent?.trim()).toBe(
      '1 of 14 stickers. Next up: finish 10 pomodoros.',
    );
    expect(JSON.parse(localStorage.getItem('tomomomento.stickersSeen')!)).toEqual(['first']);
  });
});
