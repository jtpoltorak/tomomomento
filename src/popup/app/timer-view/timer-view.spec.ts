import { TestBed } from '@angular/core/testing';
import { savePlan } from '../../../shared/plan';
import { BREAK_QUOTES, FOCUS_QUOTES } from '../../../shared/quotes';
import { createFakeStore, provideFakeStore } from '../testing';
import { TimerView } from './timer-view';

async function setup(overrides = {}) {
  const store = createFakeStore(overrides);
  TestBed.configureTestingModule({ imports: [TimerView], providers: [provideFakeStore(store)] });
  const fixture = TestBed.createComponent(TimerView);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
  return { store, fixture, el, button };
}

describe('TimerView', () => {
  it('shows a fresh 25:00 focus session ready to start', async () => {
    const { el, button } = await setup();
    expect(el.querySelector('.clock')?.textContent).toBe('25:00');
    expect(el.querySelector('.phase-pill.active')?.textContent?.trim()).toBe('Focus');
    expect(button('Start')).toBeTruthy();
  });

  it('shows time left as a progress bar below the clock', async () => {
    const { el } = await setup({ remainingMs: 10 * 60_000 });
    const bar = el.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-label')).toBe('Time left');
    expect(bar.getAttribute('aria-valuetext')).toBe('10 of 25 minutes left');
    expect(el.querySelector('.clock')?.nextElementSibling).toBe(bar);
    expect(el.querySelector('.cycle')?.getAttribute('aria-label')).toBe(
      '0 of 4 focus sessions done before a long break',
    );
  });

  it('starts and pauses through the main button', async () => {
    const { store, fixture, button } = await setup();
    button('Start').click();
    expect(store.sent).toEqual([{ command: 'start' }]);

    store.state.update((s) => ({ ...s, status: 'running', endTime: Date.now() + s.remainingMs }));
    await fixture.whenStable();
    button('Pause').click();
    expect(store.sent.at(-1)).toEqual({ command: 'pause' });
  });

  it('switches phase from the pills, but not while running', async () => {
    const { store, fixture, button } = await setup();
    button('Short break').click();
    expect(store.sent).toEqual([{ command: 'setPhase', phase: 'shortBreak' }]);

    store.state.update((s) => ({ ...s, status: 'running', endTime: Date.now() + s.remainingMs }));
    await fixture.whenStable();
    expect(button('Long break').disabled).toBe(true);
  });

  it('suggests turning on alerts until dismissed', async () => {
    const { el, fixture, store } = await setup();
    expect(el.querySelector('.hint')).toBeTruthy();
    (el.querySelector('.hint .close') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(store.alertHintDismissed()).toBe(true);
    expect(el.querySelector('.hint')).toBeNull();
  });

  it('shows no quote until quotes are turned on', async () => {
    const { el, fixture, store } = await setup();
    expect(el.querySelector('.quote')).toBeNull();

    store.settings.update((s) => ({ ...s, showQuotes: true }));
    await fixture.whenStable();
    const text = el.querySelector('.quote blockquote')?.textContent?.trim();
    expect(FOCUS_QUOTES.some((q) => q.text === text)).toBe(true);
    expect(el.querySelector('.quote figcaption')?.textContent?.trim()).toBeTruthy();
    expect(el.querySelector('.hint')).toBeNull();
  });

  it('keeps the quote through the session and picks a rest quote for the break', async () => {
    const { el, fixture, store } = await setup();
    store.settings.update((s) => ({ ...s, showQuotes: true }));
    await fixture.whenStable();
    const quoteText = () => el.querySelector('.quote blockquote')?.textContent?.trim();
    const first = quoteText();

    store.state.update((s) => ({ ...s, status: 'running', endTime: Date.now() + s.remainingMs }));
    await fixture.whenStable();
    expect(quoteText()).toBe(first);

    store.state.update((s) => ({ ...s, phase: 'shortBreak', status: 'idle' }));
    await fixture.whenStable();
    expect(BREAK_QUOTES.some((q) => q.text === quoteText())).toBe(true);
  });

  describe('Plan my day', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 13, 9, 40));
    });
    afterEach(() => vi.useRealTimers());

    async function planning(overrides = {}) {
      const ctx = await setup(overrides);
      ctx.store.settings.update((s) => ({ ...s, planEnabled: true }));
      await ctx.fixture.whenStable();
      return ctx;
    }

    it('stays out of sight until planning is turned on', async () => {
      const { el } = await setup();
      expect(el.querySelector('.plan-card, .plan-strip, .plan-add')).toBeNull();
    });

    it('offers a daily card that "Not today" hides until tomorrow', async () => {
      const { el, fixture, store, button } = await planning();
      expect(el.querySelector('.plan-card')).toBeTruthy();
      // One card at a time: the alert hint waits.
      expect(el.querySelector('.hint')).toBeNull();

      let opened = 0;
      fixture.componentInstance.openPlan.subscribe(() => opened++);
      button('Plan my day').click();
      expect(opened).toBe(1);

      button('Not today').click();
      await fixture.whenStable();
      expect(store.plan().skippedOn).toBe(store.state().todayKey);
      expect(el.querySelector('.plan-card')).toBeNull();
      expect(el.querySelector('.plan-add')?.textContent?.trim()).toBe('+ Plan today');
    });

    it('skips the card for people who turned it off', async () => {
      const { el, fixture, store } = await planning();
      store.settings.update((s) => ({ ...s, planPrompt: false }));
      await fixture.whenStable();
      expect(el.querySelector('.plan-card')).toBeNull();
      expect(el.querySelector('.plan-add')).toBeTruthy();
    });

    it('fills the plan strip as pomodoros finish', async () => {
      const { el, fixture, store } = await planning({ completedToday: 3 });
      store.plan.set(savePlan(store.plan(), store.state().todayKey, 6, []));
      await fixture.whenStable();
      const strip = el.querySelector('.plan-strip')!;
      expect(strip.querySelector('strong')?.textContent).toBe('3 of 6 planned');
      expect(strip.querySelectorAll('.seg').length).toBe(6);
      expect(strip.querySelectorAll('.seg.done').length).toBe(3);
      // Three more with breaks from 9:40: 75 + 5 + 5 = 85 minutes.
      expect(strip.textContent).toContain('done around 11:05 AM');
      expect(strip.getAttribute('aria-label')).toBe(
        "Today's plan: 3 of 6 pomodoros done, finishing around 11:05 AM. Change plan",
      );
    });

    it('celebrates a finished plan and counts extras as a bonus', async () => {
      const { el, fixture, store } = await planning({ completedToday: 4 });
      store.plan.set(savePlan(store.plan(), store.state().todayKey, 4, []));
      await fixture.whenStable();
      expect(el.querySelector('.cheer')?.textContent?.trim()).toBe(
        'Plan done! Anything more is a bonus.',
      );

      store.state.update((s) => ({ ...s, completedToday: 6 }));
      await fixture.whenStable();
      expect(el.querySelector('.cheer')).toBeNull();
      expect(el.querySelectorAll('.seg.bonus').length).toBe(2);
      expect(el.querySelector('.plan-row')?.textContent).toContain('4 of 4 planned');
      expect(el.querySelector('.plan-row')?.textContent).toContain('+2 bonus');
    });

    it('shows the label for the pomodoro in progress, then the next one on a break', async () => {
      const { el, fixture, store } = await planning({ completedToday: 1 });
      store.plan.set(savePlan(store.plan(), store.state().todayKey, 3, ['Email', 'Draft report']));
      await fixture.whenStable();
      expect(el.querySelector('.plan-now')?.textContent?.trim()).toBe('Now: Draft report');

      store.state.update((s) => ({ ...s, phase: 'shortBreak', completedToday: 0 }));
      await fixture.whenStable();
      expect(el.querySelector('.plan-now')?.textContent?.trim()).toBe('Next: Email');
    });
  });
});
