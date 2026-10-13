import { TestBed } from '@angular/core/testing';
import { savePlan } from '../../../shared/plan';
import { DEFAULT_SETTINGS } from '../../../shared/timer';
import { createFakeStore, provideFakeStore } from '../testing';
import { PlanView } from './plan-view';

describe('PlanView', () => {
  // Mid-morning, so the estimates never run past midnight.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 13, 9, 40));
  });
  afterEach(() => vi.useRealTimers());

  async function setup(configure?: (store: ReturnType<typeof createFakeStore>) => void) {
    const store = createFakeStore();
    store.settings.set({ ...DEFAULT_SETTINGS, planEnabled: true });
    configure?.(store);
    TestBed.configureTestingModule({ imports: [PlanView], providers: [provideFakeStore(store)] });
    const fixture = TestBed.createComponent(PlanView);
    let done = 0;
    fixture.componentInstance.done.subscribe(() => done++);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = (text: string) =>
      Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
    return { store, fixture, el, button, doneCount: () => done };
  }

  it('starts from the last count and shows the day laid out', async () => {
    const { el } = await setup();
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('4');
    // 4 pomodoros with 3 short breaks between them.
    expect(el.querySelectorAll('.timeline .block').length).toBe(7);
    expect(el.querySelector('.summary')?.textContent).toMatch(
      /^1h 40m of focus\. Start now and you’d be done around 11:35 AM\.$/,
    );
  });

  it('changes the count with the buttons and quick picks', async () => {
    const { el, fixture, button } = await setup();
    (el.querySelector('[aria-label="One more"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('5');

    button('8').click();
    await fixture.whenStable();
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('8');
    expect(button('8').getAttribute('aria-pressed')).toBe('true');
    // A long break after the fourth.
    expect(el.querySelectorAll('.timeline [data-phase="longBreak"]').length).toBe(1);
  });

  it('saves the plan with optional labels and goes back', async () => {
    const { el, fixture, store, button, doneCount } = await setup();
    expect(el.querySelector('details')?.open).toBe(false);
    const input = el.querySelector<HTMLInputElement>('#plan-label-1')!;
    input.value = 'Draft report';
    input.dispatchEvent(new Event('input'));
    button('Save plan').click();
    await fixture.whenStable();
    expect(store.todayPlan()).toEqual({
      date: store.state().todayKey,
      pomodoros: 4,
      labels: ['', 'Draft report', '', ''],
    });
    expect(doneCount()).toBe(1);
  });

  it('edits today’s plan, shows what is done, and can clear it', async () => {
    const { el, fixture, store, button } = await setup((s) => {
      s.state.update((st) => ({ ...st, completedToday: 2 }));
      s.plan.set(savePlan(s.plan(), s.state().todayKey, 6, ['Email']));
    });
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('6');
    expect(el.querySelector('details')?.open).toBe(true);
    expect(el.querySelectorAll('.labels li.done').length).toBe(2);
    expect(el.querySelector('.summary')?.textContent).toMatch(/^2 done, 4 to go\./);

    button('Clear plan').click();
    await fixture.whenStable();
    expect(store.todayPlan()).toBeNull();
  });

  it('calls a plan that is already met a bonus, not a failure', async () => {
    const { el } = await setup((s) => s.state.update((st) => ({ ...st, completedToday: 5 })));
    expect(el.querySelector('.timeline')).toBeNull();
    expect(el.querySelector('.summary')?.textContent).toBe(
      "You've done 5 pomodoros today, so this plan is already done. Anything more is a bonus.",
    );
  });
});
