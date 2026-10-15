import { TestBed } from '@angular/core/testing';
import { savePlan } from '../../../shared/plan';
import { SHORT_BREAK_IDEAS } from '../../../shared/break-ideas';
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

  describe('parking lot', () => {
    async function parked(phase: 'work' | 'shortBreak', seenAt = 0) {
      const ctx = await setup({ phase });
      ctx.store.settings.update((s) => ({ ...s, parkingLot: true, showQuotes: true }));
      ctx.store.parkingLot.set({
        thoughts: [
          { id: 'a', text: 'Call the dentist', at: 100 },
          { id: 'b', text: 'Buy milk', at: 200 },
        ],
        seenAt,
      });
      await ctx.fixture.whenStable();
      return ctx;
    }

    it('waits for a break before mentioning parked thoughts', async () => {
      const { el } = await parked('work');
      expect(el.querySelector('.parked-card')).toBeNull();
      expect(el.querySelector('.quote')).toBeTruthy();
    });

    it('points to new thoughts on a break, in place of the quote', async () => {
      const { el, button } = await parked('shortBreak', 150);
      expect(el.querySelector('#parked-card-title')?.textContent).toBe('1 thought parked');
      expect(el.querySelector('.quote')).toBeNull();
      expect(button('Look now')).toBeTruthy();
    });

    it('opens the lot from the card, and "Later" quiets it', async () => {
      const { el, fixture, button, store } = await parked('shortBreak');
      let opened = 0;
      fixture.componentInstance.openParking.subscribe(() => opened++);
      button('Look now').click();
      expect(opened).toBe(1);

      button('Later').click();
      await fixture.whenStable();
      expect(store.parkingLot().seenAt).toBeGreaterThan(200);
      expect(el.querySelector('.parked-card')).toBeNull();
    });

    it('stays quiet when the parking lot is off', async () => {
      const { el, fixture, store } = await parked('shortBreak');
      store.settings.update((s) => ({ ...s, parkingLot: false }));
      await fixture.whenStable();
      expect(el.querySelector('.parked-card')).toBeNull();
    });
  });

  describe('break ideas', () => {
    it('suggests one on breaks in place of "Take a breather", and another on request', async () => {
      const { el, fixture, store } = await setup({ phase: 'shortBreak' });
      expect(el.querySelector('.status')?.textContent).toBe('Time for a break');
      expect(el.querySelector('.another')).toBeNull();

      store.settings.update((s) => ({ ...s, breakIdeas: true }));
      await fixture.whenStable();
      const first = el.querySelector('.status')?.textContent;
      expect(SHORT_BREAK_IDEAS).toContain(first);

      el.querySelector<HTMLButtonElement>('[aria-label="Another idea"]')!.click();
      await fixture.whenStable();
      const second = el.querySelector('.status')?.textContent;
      expect(SHORT_BREAK_IDEAS).toContain(second);
      expect(second).not.toBe(first);
    });

    it('leaves focus sessions and pauses alone', async () => {
      const { el, fixture, store } = await setup();
      store.settings.update((s) => ({ ...s, breakIdeas: true }));
      await fixture.whenStable();
      expect(el.querySelector('.status')?.textContent).toBe('Ready to focus');

      store.state.update((s) => ({ ...s, phase: 'longBreak', status: 'paused' }));
      await fixture.whenStable();
      expect(el.querySelector('.status')?.textContent).toBe('Paused');
    });
  });

  describe('helpers card', () => {
    async function fresh(overrides = {}) {
      const ctx = await setup(overrides);
      ctx.store.helpersTipDismissed.set(false);
      await ctx.fixture.whenStable();
      return ctx;
    }

    it('offers the parking lot and break ideas until both are on', async () => {
      const { el, fixture, store } = await fresh();
      expect(el.querySelector('#helpers-title')?.textContent).toContain('New:');
      expect(el.querySelector('.hint')).toBeNull(); // one card at a time

      el.querySelector<HTMLButtonElement>('[aria-label="Turn on the parking lot"]')!.click();
      await fixture.whenStable();
      expect(store.settings().parkingLot).toBe(true);
      expect(el.querySelector('.helper-on')?.textContent).toContain('Parking lot');
      expect(store.helpersTipDismissed()).toBe(false);

      el.querySelector<HTMLButtonElement>('[aria-label="Turn on break ideas"]')!.click();
      await fixture.whenStable();
      expect(store.settings().breakIdeas).toBe(true);
      expect(store.helpersTipDismissed()).toBe(true);
      expect(el.querySelector('.helpers-card')).toBeNull();
    });

    it('goes away for good with "No thanks"', async () => {
      const { el, fixture, store, button } = await fresh();
      button('No thanks').click();
      await fixture.whenStable();
      expect(store.helpersTipDismissed()).toBe(true);
      expect(store.settings().parkingLot).toBe(false);
      expect(el.querySelector('.helpers-card')).toBeNull();
    });

    it('stays out of a running focus session', async () => {
      const { el } = await fresh({ status: 'running', endTime: Date.now() + 60_000 });
      expect(el.querySelector('.helpers-card')).toBeNull();
    });
  });

  describe('quick park', () => {
    async function focus(phase: 'work' | 'shortBreak' = 'work') {
      const ctx = await setup({ phase });
      ctx.store.settings.update((s) => ({ ...s, parkingLot: true }));
      await ctx.fixture.whenStable();
      return ctx;
    }

    it('parks a thought from the timer during focus', async () => {
      const { el, fixture, store, button } = await focus();
      button('+ Park a thought').click();
      await fixture.whenStable();
      const input = el.querySelector<HTMLInputElement>('#quick-thought')!;
      expect(el.querySelector('.footer')).toBeNull();
      input.value = 'Call the dentist';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
      expect(store.parkingLot().thoughts.map((t) => t.text)).toEqual(['Call the dentist']);
      expect(el.querySelector('#quick-thought')).toBeNull();
      expect(el.querySelector('.parked-note')?.textContent).toContain('Parked');
    });

    it('closes with Escape without parking anything', async () => {
      const { el, fixture, store, button } = await focus();
      button('+ Park a thought').click();
      await fixture.whenStable();
      const input = el.querySelector<HTMLInputElement>('#quick-thought')!;
      input.value = 'Never mind';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await fixture.whenStable();
      expect(store.parkingLot().thoughts).toEqual([]);
      expect(el.querySelector('.park-link')).toBeTruthy();
    });

    it('is not offered on breaks', async () => {
      const { el } = await focus('shortBreak');
      expect(el.querySelector('.park-link')).toBeNull();
    });

    it('is not offered with the parking lot off', async () => {
      const { el } = await setup();
      expect(el.querySelector('.park-link')).toBeNull();
    });
  });

  describe('just start', () => {
    async function offered(overrides = {}) {
      const ctx = await setup(overrides);
      ctx.store.settings.update((s) => ({ ...s, justStart: true }));
      await ctx.fixture.whenStable();
      return ctx;
    }

    it('offers a 10-minute start beside "Ready to focus"', async () => {
      const { el, fixture, store, button } = await offered();
      expect(el.querySelector('.status')?.textContent).toBe('Ready to focus');
      button('or just start: 10 min').click();
      await fixture.whenStable();
      expect(store.sent).toEqual([{ command: 'justStart' }]);
    });

    it('is not offered once the session has begun, or on breaks', async () => {
      expect((await offered({ status: 'paused' })).el.querySelector('.just-start')).toBeNull();
      TestBed.resetTestingModule();
      expect((await offered({ phase: 'shortBreak' })).el.querySelector('.just-start')).toBeNull();
    });

    it('is not offered unless turned on', async () => {
      const { el } = await setup();
      expect(el.querySelector('.just-start')).toBeNull();
    });

    it('shows a short session against its own length', async () => {
      const { el } = await setup({
        status: 'paused',
        remainingMs: 4 * 60_000,
        phaseMs: 10 * 60_000,
      });
      const bar = el.querySelector('[role="progressbar"]')!;
      expect(bar.getAttribute('aria-valuetext')).toBe('4 of 10 minutes left');
    });
  });

  describe('keep going', () => {
    it('offers a few more minutes of focus on the break after one', async () => {
      const { el, fixture, store, button } = await setup({ phase: 'shortBreak', afterFocus: true });
      expect(el.querySelector('.keep-going')).toBeNull();
      store.settings.update((s) => ({ ...s, keepGoing: true }));
      await fixture.whenStable();
      button('+5 min focus').click();
      await fixture.whenStable();
      expect(store.sent).toEqual([{ command: 'keepGoing' }]);
    });

    it('is not offered on a break you chose yourself', async () => {
      const { el, fixture, store } = await setup({ phase: 'shortBreak' });
      store.settings.update((s) => ({ ...s, keepGoing: true }));
      await fixture.whenStable();
      expect(el.querySelector('.keep-going')).toBeNull();
    });

    it('says the break is waiting during the extra time', async () => {
      const { el } = await setup({
        status: 'running',
        endTime: Date.now() + 5 * 60_000,
        remainingMs: 5 * 60_000,
        phaseMs: 5 * 60_000,
        extending: true,
      });
      expect(el.querySelector('.status')?.textContent).toBe('Extra time. Your break is waiting');
    });
  });
});
