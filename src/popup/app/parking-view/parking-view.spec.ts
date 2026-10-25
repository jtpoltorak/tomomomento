import { TestBed } from '@angular/core/testing';
import { DEFAULT_SETTINGS } from '../../../shared/timer';
import { createFakeStore, provideFakeStore } from '../testing';
import { ParkingView } from './parking-view';

describe('ParkingView', () => {
  async function setup(configure?: (store: ReturnType<typeof createFakeStore>) => void) {
    const store = createFakeStore();
    store.settings.set({ ...DEFAULT_SETTINGS, parkingLot: true });
    configure?.(store);
    TestBed.configureTestingModule({
      imports: [ParkingView],
      providers: [provideFakeStore(store)],
    });
    const fixture = TestBed.createComponent(ParkingView);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('#thought')!;
    const button = (text: string) =>
      Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
    const texts = () =>
      Array.from(el.querySelectorAll('.thoughts .text')).map((t) => t.textContent);
    const type = async (text: string) => {
      input.value = text;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
    };
    return { store, fixture, el, input, button, texts, type };
  }

  it('parks a thought with Enter and says it will wait for the break', async () => {
    const { el, input, texts, type } = await setup();
    expect(el.querySelector('.empty')?.textContent).toContain('Nothing parked');
    await type('Call the dentist');
    expect(texts()).toEqual(['Call the dentist']);
    expect(input.value).toBe('');
    expect(el.querySelector('[role="status"]')?.textContent?.trim()).toBe(
      'Parked. It will be here on your break.',
    );
    expect(el.querySelector('#parked-heading')?.textContent).toBe('Parked (1)');
  });

  it('marks the lot as seen when it opens', async () => {
    const { store } = await setup((s) => {
      s.parkingLot.set({ thoughts: [{ id: 'a', text: 'Old', at: 1 }], seenAt: 0 });
    });
    expect(store.parkingLot().seenAt).toBeGreaterThan(1);
  });

  it('removes a thought with its check mark', async () => {
    const { el, fixture, texts, type } = await setup();
    await type('One');
    await type('Two');
    el.querySelector<HTMLButtonElement>('[aria-label="Done with One"]')!.click();
    await fixture.whenStable();
    expect(texts()).toEqual(['Two']);
  });

  it('asks before clearing them all', async () => {
    const { el, fixture, button, texts, type } = await setup();
    await type('One');
    await type('Two');
    button('Clear all').click();
    await fixture.whenStable();
    expect(el.querySelector('#clear-question')?.textContent).toBe('Clear all 2 thoughts?');
    button('Cancel').click();
    await fixture.whenStable();
    expect(texts().length).toBe(2);

    button('Clear all').click();
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.confirm .danger')!.click();
    await fixture.whenStable();
    expect(texts()).toEqual([]);
    expect(el.querySelector('[role="status"]')?.textContent?.trim()).toBe('Cleared 2 thoughts.');
  });

  it('picks one thought for you and can start focus on it', async () => {
    const { store, fixture, el, type, button } = await setup((s) =>
      s.settings.update((v) => ({ ...v, pickForMe: true })),
    );
    expect(el.querySelector('.pick-btn')).toBeNull();
    await type('Call the dentist');
    await type('Water the plants');
    vi.useFakeTimers();
    try {
      button('Pick one for me').click();
      vi.advanceTimersByTime(2000);
      fixture.detectChanges();
      const picked = el.querySelector('.picked strong')?.textContent;
      expect(['Call the dentist', 'Water the plants']).toContain(picked);
      expect(el.querySelector('.thoughts li.lit .text')?.textContent).toBe(picked);
      let started = 0;
      fixture.componentInstance.started.subscribe(() => started++);
      button('Start focus on it').click();
      await Promise.resolve();
      await Promise.resolve();
      expect(store.sent).toEqual([{ command: 'start', step: picked }]);
      expect(started).toBe(1);
      // Picking again always lands on a different thought.
      button('Pick again').click();
      vi.advanceTimersByTime(2000);
      fixture.detectChanges();
      expect(el.querySelector('.picked strong')?.textContent).not.toBe(picked);
    } finally {
      vi.useRealTimers();
    }
  });
});
