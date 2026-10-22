import { TestBed } from '@angular/core/testing';
import { DEFAULT_SETTINGS } from '../../../shared/timer';
import { createFakeStore, provideFakeStore } from '../testing';
import { WrapUpView } from './wrap-up-view';

describe('WrapUpView', () => {
  async function setup() {
    const store = createFakeStore();
    store.settings.set({ ...DEFAULT_SETTINGS, parkingLot: true, dayWrapUp: true });
    store.parkingLot.set({
      thoughts: [
        { id: 'a', text: 'Call the dentist', at: 100 },
        { id: 'b', text: 'Buy milk', at: 200 },
        { id: 'c', text: 'Reply to Sam', at: 300 },
      ],
      seenAt: 0,
    });
    TestBed.configureTestingModule({ imports: [WrapUpView], providers: [provideFakeStore(store)] });
    const fixture = TestBed.createComponent(WrapUpView);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const click = async (text: string) => {
      Array.from(el.querySelectorAll('button'))
        .find((b) => b.textContent?.trim() === text)!
        .click();
      await fixture.whenStable();
    };
    return { store, fixture, el, click };
  }

  it('goes through the parked thoughts one at a time', async () => {
    const { store, el, click } = await setup();
    expect(store.parkingLot().wrappedOn).toBe(store.state().todayKey);
    expect(el.querySelector('.count')?.textContent).toBe('1 of 3');
    expect(el.querySelector('.thought')?.textContent).toBe('Call the dentist');

    await click('Done');
    expect(el.querySelector('.thought')?.textContent).toBe('Buy milk');
    await click('Keep for tomorrow');
    expect(el.querySelector('.count')?.textContent).toBe('3 of 3');
    await click('Let go');

    expect(store.parkingLot().thoughts.map((t) => t.text)).toEqual(['Buy milk']);
    expect(store.parkingLot().seenAt).toBeGreaterThan(300);
    expect(el.querySelector('.all-sorted')?.textContent).toBe('All sorted. Rest easy.');
    expect(el.querySelector('.end .note')?.textContent).toBe(
      '2 thoughts cleared, 1 kept for tomorrow.',
    );
  });

  it('heads back to the timer at the end', async () => {
    const { fixture, click } = await setup();
    let finished = 0;
    fixture.componentInstance.finished.subscribe(() => finished++);
    for (let i = 0; i < 3; i++) await click('Let go');
    await click('Done for today');
    expect(finished).toBe(1);
  });
});
