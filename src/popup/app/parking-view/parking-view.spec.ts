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
});
