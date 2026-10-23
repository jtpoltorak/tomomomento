import { localDateKey } from '../../../shared/timer';
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

  describe('day wrap-up', () => {
    async function evening(hour = 18) {
      const ctx = await setup({ phase: 'shortBreak' });
      const now = new Date();
      now.setHours(hour, 0, 0, 0);
      ctx.store.tick.set(now.getTime());
      ctx.store.settings.update((s) => ({ ...s, parkingLot: true, dayWrapUp: true }));
      ctx.store.parkingLot.set({
        thoughts: [
          { id: 'a', text: 'Call the dentist', at: 100 },
          { id: 'b', text: 'Buy milk', at: 200 },
        ],
        seenAt: 0,
      });
      await ctx.fixture.whenStable();
      return ctx;
    }

    it('offers to wrap up in the evening, in place of the parked card', async () => {
      const { el, fixture, button } = await evening();
      expect(el.querySelector('#wrap-card-title')?.textContent).toBe(
        'Wrap up your day? 2 thoughts parked',
      );
      expect(el.querySelector('#parked-card-title')).toBeNull();
      let opened = 0;
      fixture.componentInstance.openWrapUp.subscribe(() => opened++);
      button('Wrap up').click();
      expect(opened).toBe(1);
    });

    it('waits until evening', async () => {
      expect((await evening(15)).el.querySelector('#wrap-card-title')).toBeNull();
    });

    it('"Not tonight" hides it until tomorrow', async () => {
      const { el, fixture, store, button } = await evening();
      button('Not tonight').click();
      await fixture.whenStable();
      expect(store.parkingLot().wrappedOn).toBe(store.state().todayKey);
      expect(el.querySelector('#wrap-card-title')).toBeNull();
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

  describe('settle in', () => {
    function breathing(secondsIn: number) {
      const now = Date.now();
      const start = now - secondsIn * 1000;
      return setup({
        status: 'running',
        settleUntil: start + 30_000,
        endTime: start + 30_000 + 25 * 60_000,
      });
    }

    it('guides the breath while the clock waits', async () => {
      const { el } = await breathing(1);
      expect(el.querySelector('.status')?.textContent).toBe('Breathe in…');
      expect(el.querySelector('.breath-count')?.textContent).toBe('3');
      expect(el.querySelector('.breath-count')?.getAttribute('aria-hidden')).toBe('true');
      expect(el.querySelector('.clock')?.textContent).toBe('25:00');
      expect(el.querySelector('.bar-fill')?.classList).toContain('settling');
      // One steady line for screen readers, not a new one with every breath.
      expect(el.querySelector('.status')?.getAttribute('aria-live')).toBeNull();
      expect(el.querySelector('.visually-hidden[aria-live]')?.textContent).toBe(
        'Settling in. Focus starts in 30 seconds.',
      );
    });

    it('shows the breathing circle in place of the clock, when turned on', async () => {
      const { el, fixture, store } = await breathing(1);
      expect(el.querySelector('app-breath-circle')).toBeNull();
      store.settings.update((s) => ({ ...s, breathCircle: true }));
      await fixture.whenStable();
      expect(el.querySelector('.clock.breathing app-breath-circle')).toBeTruthy();
      expect(el.querySelector('.digit')).toBeNull();
      expect(el.querySelector('.bar-fill')?.classList).not.toContain('settling');
    });

    it('breathes out after 4 seconds', async () => {
      const { el } = await breathing(5);
      expect(el.querySelector('.status')?.textContent).toBe('Breathe out…');
      expect(el.querySelector('.breath-count')?.textContent).toBe('5');
    });

    it('can start the clock right away', async () => {
      const { store, fixture, button } = await breathing(1);
      button('Start now').click();
      await fixture.whenStable();
      expect(store.sent).toEqual([{ command: 'skipSettle' }]);
    });

    it('steps aside once the breathing is over', async () => {
      const { el, button } = await breathing(31);
      expect(el.querySelector('.status')?.textContent).toBe('Stay focused');
      expect(el.querySelector('.bar-fill')?.classList).not.toContain('settling');
      expect(button('Start now')).toBeUndefined();
    });
  });

  describe('step away', () => {
    it('says the timer paused while you were away, and offers to count the time', async () => {
      const { el, store, fixture, button } = await setup({
        status: 'paused',
        remainingMs: 15 * 60_000,
        pausedAt: Date.now() - 20 * 60_000,
        away: true,
      });
      expect(el.querySelector('.status')?.textContent).toBe('Paused while you were away');
      expect(button('Resume')).toBeTruthy();
      button('I was working').click();
      await fixture.whenStable();
      expect(store.sent).toEqual([{ command: 'wasWorking' }]);
    });

    it('is not offered for an ordinary pause', async () => {
      const { button } = await setup({ status: 'paused', remainingMs: 15 * 60_000 });
      expect(button('I was working')).toBeUndefined();
    });
  });

  describe('small wins', () => {
    beforeEach(() => localStorage.clear());

    const ended = Date.now() - 1000;
    function justFinished() {
      return setup({
        phase: 'shortBreak',
        afterFocus: true,
        completedToday: 3,
        lastFocusEnd: ended,
      });
    }

    it('celebrates a finished session for a few seconds, once', async () => {
      const { el, store, fixture } = await justFinished();
      vi.useFakeTimers();
      try {
        store.settings.update((s) => ({ ...s, smallWins: true }));
        fixture.detectChanges();
        expect(el.querySelector('.status')?.textContent).toBe('You did it! 3 done today.');
        expect(el.querySelector('.dial')?.classList).toContain('win');
        await vi.advanceTimersByTimeAsync(5_000);
        fixture.detectChanges();
        expect(el.querySelector('.status')?.textContent).toBe('Time for a break');
      } finally {
        vi.useRealTimers();
      }
      // Opening the timer again on the same break doesn't repeat it.
      TestBed.resetTestingModule();
      const again = await justFinished();
      again.store.settings.update((s) => ({ ...s, smallWins: true }));
      await again.fixture.whenStable();
      expect(again.el.querySelector('.status')?.textContent).toBe('Time for a break');
    });

    it('stays quiet unless turned on', async () => {
      const { el } = await justFinished();
      expect(el.querySelector('.status')?.textContent).toBe('Time for a break');
    });
  });

  describe('take-care reminders', () => {
    it('shows on the break after a few sessions in a row, ahead of break ideas', async () => {
      const { el, store, fixture } = await setup({
        phase: 'shortBreak',
        status: 'running',
        endTime: Date.now() + 5 * 60_000,
        afterFocus: true,
        inARow: 3,
      });
      store.settings.update((s) => ({ ...s, takeCare: true, breakIdeas: true }));
      await fixture.whenStable();
      expect(el.querySelector('.status')?.textContent).toBe('3 in a row. Have a glass of water');
      expect(el.querySelector('.another')).toBeNull();
    });
  });

  describe('first tiny step', () => {
    async function asking() {
      const ctx = await setup();
      ctx.store.settings.update((s) => ({ ...s, firstStep: true }));
      await ctx.fixture.whenStable();
      ctx.button('Start').click();
      await ctx.fixture.whenStable();
      return ctx;
    }

    it('asks before starting, then starts with the step', async () => {
      const { el, fixture, store } = await asking();
      expect(store.sent).toEqual([]);
      expect(el.querySelector('#first-step-label')?.textContent).toBe(
        "What's the first tiny step?",
      );
      const input = el.querySelector<HTMLInputElement>('#first-step')!;
      input.value = 'open the doc';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
      expect(store.sent).toEqual([{ command: 'start', step: 'open the doc' }]);
      expect(el.querySelector('.first-step')).toBeNull();
    });

    it('can be skipped or closed', async () => {
      const { store, button } = await asking();
      button('Skip and start').click();
      expect(store.sent).toEqual([{ command: 'start' }]);
      TestBed.resetTestingModule();

      const again = await asking();
      again.el
        .querySelector('#first-step')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await again.fixture.whenStable();
      expect(again.store.sent).toEqual([]);
      expect(again.button('Start')).toBeTruthy();
    });

    it('shows the step under the timer during the session', async () => {
      const { el } = await setup({
        status: 'running',
        endTime: Date.now() + 60_000,
        firstStep: 'open the doc',
      });
      expect(el.querySelector('.plan-now')?.textContent?.trim()).toBe('First step: open the doc');
    });
  });

  describe('energy check-in', () => {
    it('asks on the break after a focus session, once', async () => {
      const ended = Date.now() - 60_000;
      const { el, fixture, store, button } = await setup({
        phase: 'shortBreak',
        lastFocusEnd: ended,
      });
      expect(el.querySelector('#energy-card-title')).toBeNull();
      store.settings.update((s) => ({ ...s, energyCheck: true }));
      await fixture.whenStable();
      expect(el.querySelector('#energy-card-title')?.textContent).toBe('How was that one?');
      button('Great').click();
      expect(store.sent).toEqual([{ command: 'rateEnergy', level: 3 }]);

      store.state.update((s) => ({ ...s, energyFor: ended }));
      await fixture.whenStable();
      expect(el.querySelector('#energy-card-title')).toBeNull();
    });
  });

  describe('weekly look-back', () => {
    beforeEach(() => localStorage.removeItem('tomomomento.lookedBack'));

    it('sums up last week once, until acknowledged', async () => {
      const lastWed = new Date();
      lastWed.setHours(12, 0, 0, 0);
      lastWed.setDate(lastWed.getDate() - ((lastWed.getDay() + 6) % 7) - 5);
      const key = localDateKey(lastWed.getTime());
      const store = createFakeStore({}, { [key]: { pomodoros: 4, focusMinutes: 100 } });
      store.settings.update((s) => ({ ...s, weeklyLookBack: true }));
      TestBed.configureTestingModule({
        imports: [TimerView],
        providers: [provideFakeStore(store)],
      });
      const fixture = TestBed.createComponent(TimerView);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('#look-back-title')?.textContent).toBe(
        'Last week: 4 pomodoros, 1h 40m focused',
      );
      expect(el.querySelector('.look-back-best')?.textContent).toBe('Best day: Wednesday, with 4.');
      el.querySelector<HTMLButtonElement>('.look-back .pill-btn')!.click();
      await fixture.whenStable();
      expect(el.querySelector('.look-back')).toBeNull();
      expect(localStorage.getItem('tomomomento.lookedBack')).toBeTruthy();
    });
  });

  describe('keyboard shortcuts', () => {
    const press = (key: string, target: EventTarget = document.body) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

    it('skips, restarts and parks with single keys, when turned on', async () => {
      const { el, fixture, store } = await setup();
      press('s');
      expect(store.sent).toEqual([]);

      store.settings.update((s) => ({ ...s, shortcuts: true, parkingLot: true }));
      await fixture.whenStable();
      press('s');
      press('R');
      expect(store.sent).toEqual([{ command: 'skip' }, { command: 'reset' }]);
      press('p');
      await fixture.whenStable();
      const box = el.querySelector<HTMLInputElement>('#quick-thought')!;
      expect(box).toBeTruthy();
      press('s', box); // typing in a box is just typing
      expect(store.sent.length).toBe(2);
    });
  });

  describe('distraction tally', () => {
    it('offers "I drifted" while focusing, and notes the tap', async () => {
      const { el, fixture, store, button } = await setup({
        status: 'running',
        endTime: Date.now() + 600_000,
      });
      expect(el.querySelector('.drift-slot')).toBeNull();
      store.settings.update((s) => ({ ...s, driftTally: true, shortcuts: true }));
      await fixture.whenStable();
      button('I drifted').click();
      await fixture.whenStable();
      expect(store.sent).toEqual([{ command: 'drifted' }]);
      expect(el.querySelector('.drift-slot')?.textContent?.trim()).toBe('✓ Noted');

      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
      expect(store.sent).toEqual([{ command: 'drifted' }, { command: 'drifted' }]);

      store.state.update((s) => ({ ...s, phase: 'shortBreak' }));
      await fixture.whenStable();
      expect(el.querySelector('.drift-slot')).toBeNull();
    });
  });

  describe('visual timer', () => {
    it('shows a shrinking disc in place of the digits, with the time left for screen readers', async () => {
      const { el, fixture, store } = await setup();
      expect(el.querySelector('app-visual-timer')).toBeNull();
      store.settings.update((s) => ({ ...s, visualTimer: true }));
      await fixture.whenStable();
      const clock = el.querySelector('.clock.visual')!;
      expect(clock.querySelector('app-visual-timer')).toBeTruthy();
      expect(clock.querySelector('.digit')).toBeNull();
      expect(clock.getAttribute('role')).toBe('timer');
      expect(clock.getAttribute('aria-label')).toBe('25 of 25 minutes left');
    });
  });

  describe('daily intention', () => {
    beforeEach(() => localStorage.removeItem('tomomomento.intention'));

    it('asks once a day and keeps the answer at the top', async () => {
      const { el, fixture, store, button } = await setup();
      expect(el.querySelector('#intention')).toBeNull();
      store.settings.update((s) => ({ ...s, dailyIntention: true }));
      await fixture.whenStable();
      const box = el.querySelector<HTMLInputElement>('#intention')!;
      expect(el.querySelector('#intention-label')?.textContent).toBe('What matters most today?');
      box.value = '  Send the proposal  ';
      button('Set').click();
      await fixture.whenStable();
      expect(el.querySelector('#intention')).toBeNull();
      expect(el.querySelector('.intention-text')?.textContent).toBe('Send the proposal');

      button('Change').click();
      await fixture.whenStable();
      expect(el.querySelector<HTMLInputElement>('#intention')?.value).toBe('Send the proposal');
      el.querySelector('#intention')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape' }),
      );
      await fixture.whenStable();
      expect(el.querySelector('#intention')).toBeNull();
      expect(el.querySelector('.intention-text')?.textContent).toBe('Send the proposal');
    });

    it('lets a day be skipped, and asks again tomorrow', async () => {
      localStorage.setItem(
        'tomomomento.intention',
        JSON.stringify({ day: '2020-01-01', text: 'Old news' }),
      );
      const { el, fixture, store, button } = await setup();
      store.settings.update((s) => ({ ...s, dailyIntention: true }));
      await fixture.whenStable();
      expect(el.querySelector('.intention')).toBeNull();
      button('Not today').click();
      await fixture.whenStable();
      expect(el.querySelector('#intention')).toBeNull();
      expect(el.querySelector('.intention')).toBeNull();
      expect(JSON.parse(localStorage.getItem('tomomomento.intention')!).text).toBe('');
    });
  });

  describe('where was I', () => {
    beforeEach(() => localStorage.removeItem('tomomomento.leftOff'));

    it('asks once when focus pauses, and shows the note until that session is done', async () => {
      const pausedAt = Date.now() - 1000;
      const { el, fixture, store, button } = await setup({ status: 'paused', pausedAt });
      expect(el.querySelector('#left-off')).toBeNull();
      store.settings.update((s) => ({ ...s, whereWasI: true }));
      await fixture.whenStable();
      expect(el.querySelector('#left-off-label')?.textContent).toBe('Where did you leave off?');
      el.querySelector<HTMLInputElement>('#left-off')!.value = 'Halfway through section 2';
      button('Save').click();
      await fixture.whenStable();
      expect(el.querySelector('#left-off')).toBeNull();
      expect(el.querySelector('.plan-now')?.textContent?.trim()).toBe(
        'Left off: Halfway through section 2',
      );

      // That session finishes: the break asks again, and the old note retires.
      store.state.update((s) => ({
        ...s,
        phase: 'shortBreak',
        status: 'running',
        lastFocusEnd: Date.now(),
      }));
      await fixture.whenStable();
      expect(el.querySelector('.plan-now')).toBeNull();
      expect(el.querySelector('#left-off')).toBeTruthy();
      button('Skip').click();
      await fixture.whenStable();
      expect(el.querySelector('#left-off')).toBeNull();
    });
  });

  describe('ends at', () => {
    it('shows the time the running phase ends, when turned on', async () => {
      const end = new Date();
      end.setHours(14, 45, 0, 0);
      const { el, fixture, store } = await setup({ status: 'running', endTime: end.getTime() });
      expect(el.querySelector('.ends-at')).toBeNull();
      store.settings.update((s) => ({ ...s, showEndsAt: true }));
      await fixture.whenStable();
      expect(el.querySelector('.ends-at')?.textContent).toBe('Ends at 2:45 PM');

      store.state.update((s) => ({ ...s, status: 'paused', endTime: null }));
      await fixture.whenStable();
      expect(el.querySelector('.ends-at')).toBeNull();
    });
  });

  describe('rhythm presets', () => {
    async function offered(overrides = {}) {
      const ctx = await setup(overrides);
      ctx.store.settings.update((s) => ({ ...s, rhythmPresets: true }));
      await ctx.fixture.whenStable();
      return ctx;
    }

    it('sets the timers in one tap and marks the one in use', async () => {
      const { el, fixture, store } = await offered();
      const chips = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.rhythm'));
      expect(chips().map((c) => c.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        'Classic 25/5',
        'Short 15/3',
        'Deep 50/10',
      ]);
      expect(chips()[0].getAttribute('aria-pressed')).toBe('true');
      chips()[2].click();
      await fixture.whenStable();
      expect(store.settings()).toMatchObject({ workMinutes: 50, shortBreakMinutes: 10 });
      expect(chips()[2].getAttribute('aria-pressed')).toBe('true');
    });

    it('only shows before a focus session starts', async () => {
      expect((await offered({ status: 'paused' })).el.querySelector('.rhythms')).toBeNull();
      TestBed.resetTestingModule();
      expect((await offered({ phase: 'shortBreak' })).el.querySelector('.rhythms')).toBeNull();
      TestBed.resetTestingModule();
      expect((await setup()).el.querySelector('.rhythms')).toBeNull();
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

  describe('heads-up', () => {
    const lastMinute = (phase: 'work' | 'shortBreak') => ({
      phase,
      status: 'running' as const,
      endTime: Date.now() + 45_000,
      remainingMs: 45_000,
    });

    it('says a minute is left and makes the bar glow', async () => {
      const { el, fixture, store } = await setup(lastMinute('work'));
      expect(el.querySelector('.heads-up')).toBeNull();
      store.settings.update((s) => ({ ...s, headsUp: true }));
      await fixture.whenStable();
      expect(el.querySelector('.dial')?.classList).toContain('heads-up');
      expect(el.querySelector('.status')?.textContent).toBe('1 minute left: find a stopping point');
    });

    it('has its own words for the end of a break', async () => {
      const { el, fixture, store } = await setup(lastMinute('shortBreak'));
      store.settings.update((s) => ({ ...s, headsUp: true }));
      await fixture.whenStable();
      expect(el.querySelector('.status')?.textContent).toBe('1 minute left on your break');
    });
  });

  describe('calm clock', () => {
    it('shows whole minutes instead of a ticking clock', async () => {
      const { el, fixture, store } = await setup({ remainingMs: 24 * 60_000 + 30_000 });
      expect(el.querySelector('.clock')?.textContent).toBe('24:30');
      store.settings.update((s) => ({ ...s, calmClock: true }));
      await fixture.whenStable();
      const clock = el.querySelector('.clock')!;
      expect(Array.from(clock.querySelectorAll('.digit'), (d) => d.textContent).join('')).toBe(
        '25',
      );
      expect(clock.querySelector('.unit')?.textContent).toBe('min');
      expect(clock.getAttribute('aria-label')).toBe('25 minutes left');
    });

    it('says "1 minute" in the last one', async () => {
      const { el, fixture, store } = await setup({ remainingMs: 20_000 });
      store.settings.update((s) => ({ ...s, calmClock: true }));
      await fixture.whenStable();
      expect(el.querySelector('.clock')?.getAttribute('aria-label')).toBe('1 minute left');
    });
  });

  describe('animated digits', () => {
    it('rolls in only the digits that changed', async () => {
      const { el, fixture, store } = await setup({ remainingMs: 24 * 60_000 + 30_000 });
      expect(el.querySelector('.clock')?.classList).not.toContain('rolling');
      store.settings.update((s) => ({ ...s, animateDigits: true }));
      await fixture.whenStable();
      const clock = el.querySelector('.clock')!;
      const before = Array.from(clock.querySelectorAll('.digit'));
      expect(before.map((d) => d.textContent)).toEqual(['2', '4', ':', '3', '0']);
      expect(clock.getAttribute('aria-label')).toBe('24:30 left');

      store.state.update((s) => ({ ...s, remainingMs: 24 * 60_000 + 29_000 }));
      await fixture.whenStable();
      const after = Array.from(clock.querySelectorAll('.digit'));
      expect(after.map((d) => d.textContent)).toEqual(['2', '4', ':', '2', '9']);
      // Unchanged digits stay put; the changed ones are new elements, which is what animates.
      expect(after.slice(0, 3)).toEqual(before.slice(0, 3));
      expect(after[3]).not.toBe(before[3]);
      expect(after[4]).not.toBe(before[4]);
      expect(clock.classList).toContain('rolling');
    });

    it('works with the calm clock too', async () => {
      const { el, fixture, store } = await setup({ remainingMs: 9 * 60_000 + 30_000 });
      store.settings.update((s) => ({ ...s, animateDigits: true, calmClock: true }));
      await fixture.whenStable();
      const clock = el.querySelector('.clock.calm')!;
      expect(Array.from(clock.querySelectorAll('.digit')).map((d) => d.textContent)).toEqual([
        '1',
        '0',
      ]);
      expect(clock.querySelector('.unit')?.textContent).toBe('min');
    });
  });

  describe('minimal timer', () => {
    it('shows just the clock, the bar and one button until asked for more', async () => {
      const { el, fixture, store, button } = await setup({ completedToday: 2 });
      store.settings.update((s) => ({ ...s, minimalMode: true, showQuotes: true }));
      await fixture.whenStable();
      expect(el.classList).toContain('minimal');
      expect(el.querySelector('.clock')).toBeTruthy();
      expect(el.querySelector('.bar')).toBeTruthy();
      expect(el.querySelector('.status')?.textContent).toBe('Ready to focus');
      expect(
        Array.from(el.querySelectorAll('.controls button'), (b) => b.textContent?.trim()),
      ).toEqual(['Start']);
      for (const hidden of ['.phases', '.footer', '.quote']) {
        expect(el.querySelector(hidden)).toBeNull();
      }

      button('Show more').click();
      await fixture.whenStable();
      expect(el.classList).not.toContain('minimal');
      expect(el.querySelector('.phases')).toBeTruthy();
      expect(el.querySelector('.footer')?.textContent).toContain('2 done today');
      expect(el.querySelector('.more-toggle')).toBeNull();

      // Starting the timer tidies it back up.
      store.state.update((s) => ({ ...s, status: 'running', endTime: Date.now() + 25 * 60_000 }));
      await fixture.whenStable();
      expect(el.classList).toContain('minimal');
      expect(el.querySelector('.phases')).toBeNull();
    });

    it('keeps the toggle out of the way when it is off', async () => {
      const { el } = await setup();
      expect(el.querySelector('.more-toggle')).toBeNull();
      expect(el.querySelector('.phases')).toBeTruthy();
    });
  });

  describe('paused reminder', () => {
    it('asks whether to pick it back up after a long pause', async () => {
      const { el, fixture, store } = await setup({
        status: 'paused',
        remainingMs: 12 * 60_000,
        pausedAt: Date.now() - 11 * 60_000,
      });
      expect(el.querySelector('.status')?.textContent).toBe('Paused');
      store.settings.update((s) => ({ ...s, pauseNudge: true }));
      await fixture.whenStable();
      expect(el.querySelector('.status')?.textContent).toBe('Still paused. Pick it back up?');
    });

    it('just says "Paused" for a short pause', async () => {
      const { el, fixture, store } = await setup({
        status: 'paused',
        remainingMs: 12 * 60_000,
        pausedAt: Date.now() - 60_000,
      });
      store.settings.update((s) => ({ ...s, pauseNudge: true }));
      await fixture.whenStable();
      expect(el.querySelector('.status')?.textContent).toBe('Paused');
    });
  });
});
