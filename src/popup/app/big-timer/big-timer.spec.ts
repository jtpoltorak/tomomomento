import { TestBed } from '@angular/core/testing';
import { createFakeStore, provideFakeStore } from '../testing';
import { BigTimer } from './big-timer';

async function setup() {
  const store = createFakeStore();
  TestBed.configureTestingModule({ imports: [BigTimer], providers: [provideFakeStore(store)] });
  const fixture = TestBed.createComponent(BigTimer);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return { store, fixture, el };
}

describe('BigTimer', () => {
  it('shows the phase and the clock, and starts from its one button', async () => {
    const { store, fixture, el } = await setup();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Focus');
    expect(el.querySelector('[role=timer]')?.textContent?.trim()).toBe('25:00');
    expect(el.querySelector('[role=timer]')?.getAttribute('aria-label')).toBe('25 minutes left');
    el.querySelector<HTMLButtonElement>('.go')!.click();
    expect(store.sent).toEqual([{ command: 'start' }]);
    store.state.update((s) => ({ ...s, status: 'running' }));
    await fixture.whenStable();
    expect(el.querySelector('.go')?.textContent?.trim()).toBe('Pause');
  });

  it('shows whole minutes with the calm clock on', async () => {
    const { store, fixture, el } = await setup();
    store.settings.update((s) => ({ ...s, calmClock: true }));
    await fixture.whenStable();
    expect(el.querySelector('[role=timer]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '25 min',
    );
  });

  it('closes with Escape or the close button', async () => {
    const { fixture, el } = await setup();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    el.querySelector<HTMLButtonElement>('.close')!.click();
    expect(closed).toBe(2);
  });
});
