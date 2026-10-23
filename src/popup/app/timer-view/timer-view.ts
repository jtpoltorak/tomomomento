import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  Injector,
  output,
  signal,
  untracked,
} from '@angular/core';
import { formatTime, isAfterToday, planSchedule } from '../../../shared/plan';
import { breakIdea } from '../../../shared/break-ideas';
import { MAX_THOUGHT_LENGTH, thoughtsText, wrapUpDue } from '../../../shared/parking';
import { pickQuote, type Quote } from '../../../shared/quotes';
import { ENERGY_LABELS, type Energy } from '../../../shared/stats';
import {
  breathAt,
  canAskFirstStep,
  canJustStart,
  MAX_STEP_LENGTH,
  careNudge,
  canKeepGoing,
  calmMinutes,
  formatClock,
  inHeadsUp,
  pauseNudgeAt,
  JUST_START_MINUTES,
  KEEP_GOING_MINUTES,
  PHASE_LABELS,
  applyRhythm,
  RHYTHMS,
  rhythmOf,
  type RhythmId,
  SETTLE_MS,
  settling,
  smallWin,
  WIN_WINDOW_MS,
  type Phase,
} from '../../../shared/timer';
import { PomodoroStore } from '../pomodoro-store';

@Component({
  selector: 'app-timer-view',
  host: { '[class.minimal]': 'minimal()' },
  templateUrl: './timer-view.html',
  styleUrl: './timer-view.css',
})
export class TimerView {
  protected readonly store = inject(PomodoroStore);
  readonly openSettings = output<void>();
  readonly openPlan = output<void>();
  readonly openParking = output<void>();
  readonly openWrapUp = output<void>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly phases: { id: Phase; label: string }[] = [
    { id: 'work', label: PHASE_LABELS.work },
    { id: 'shortBreak', label: PHASE_LABELS.shortBreak },
    { id: 'longBreak', label: PHASE_LABELS.longBreak },
  ];

  private readonly phase = computed(() => this.store.state().phase);
  private lastQuote?: Quote;
  /** Re-picks only when the phase changes, not on every tick or settings save. */
  private readonly phaseQuote = computed(() => {
    this.lastQuote = pickQuote(this.phase(), this.lastQuote);
    return this.lastQuote;
  });
  /**
   * A card offering the optional helpers (parking lot, break ideas) to anyone
   * who hasn't turned them both on or said no. It stays out of a running focus
   * session, and the daily plan card comes first.
   */
  protected readonly helpersCard = computed(() => {
    const s = this.store.settings();
    const { phase, status } = this.store.state();
    return (
      !this.store.helpersTipDismissed() &&
      !(s.parkingLot && s.breakIdeas) &&
      !(phase === 'work' && status === 'running') &&
      !this.store.showPlanPrompt()
    );
  });
  /**
   * In the evening, the day wrap-up offers to sort what's still parked. It
   * stays out of a running focus session, and the plan card comes first.
   */
  protected readonly wrapCard = computed(() => {
    const s = this.store.settings();
    const { phase, status, todayKey } = this.store.state();
    const lot = this.store.parkingLot();
    return s.parkingLot &&
      s.dayWrapUp &&
      !(phase === 'work' && status === 'running') &&
      !this.store.showPlanPrompt() &&
      !this.helpersCard() &&
      wrapUpDue(lot, todayKey, this.store.tick())
      ? lot.thoughts.length
      : 0;
  });
  protected readonly wrapText = computed(() => thoughtsText(this.wrapCard()));
  /** On a break, how many thoughts were parked since you last looked. The plan card comes first. */
  protected readonly parkedCard = computed(() =>
    this.store.showPlanPrompt() || this.helpersCard() || this.wrapCard()
      ? 0
      : this.store.parkedOnBreak(),
  );
  protected readonly parkedText = computed(() => thoughtsText(this.parkedCard()));
  /** On the break after a focus session, a one-tap check-in on how it went. Other cards come first. */
  protected readonly energyCard = computed(() => {
    const { phase, lastFocusEnd, energyFor } = this.store.state();
    return (
      this.store.settings().energyCheck &&
      phase !== 'work' &&
      lastFocusEnd !== undefined &&
      energyFor !== lastFocusEnd &&
      this.store.tick() - lastFocusEnd < WIN_WINDOW_MS &&
      !this.store.showPlanPrompt() &&
      !this.helpersCard() &&
      !this.wrapCard() &&
      !this.parkedCard()
    );
  });
  protected readonly energyLevels = ([1, 2, 3] as const).map((level) => ({
    level,
    label: ENERGY_LABELS[level],
  }));
  // The popup only has room for one extra line of text under the controls, so
  // the daily plan card, the parked thoughts card and your own label for this
  // pomodoro come before a quote.
  protected readonly quote = computed(() =>
    this.store.settings().showQuotes &&
    !this.store.showPlanPrompt() &&
    !this.helpersCard() &&
    !this.parkedCard() &&
    !this.wrapCard() &&
    !this.energyCard() &&
    !this.askStep() &&
    !this.planLabelNow()
      ? this.phaseQuote()
      : null,
  );
  // Anyone who turned on quotes or planning has been through Settings and seen
  // the alert options, so they don't need the hint.
  protected readonly showAlertHint = computed(() => {
    const s = this.store.settings();
    return (
      this.store.alertsOff() &&
      !this.store.alertHintDismissed() &&
      !s.showQuotes &&
      !s.planEnabled &&
      !s.parkingLot &&
      !s.breakIdeas &&
      !this.helpersCard()
    );
  });

  /**
   * With the minimal timer on, everything but the clock, bar and main button waits for
   * "Show more". It tidies itself back up when the timer starts and when the popup reopens.
   */
  protected readonly showAll = signal(false);
  protected readonly minimal = computed(() => this.store.settings().minimalMode && !this.showAll());
  protected readonly full = computed(() => !this.minimal());

  protected readonly clock = computed(() => formatClock(this.store.remainingMs()));
  /**
   * Whole minutes left with the calm clock on, or null for the usual clock.
   * Only changes once a minute, so nothing ticks.
   */
  protected readonly calmClock = computed(() =>
    this.store.settings().calmClock ? calmMinutes(this.store.remainingMs()) : null,
  );
  /** The clock split into characters, so each digit can roll in on its own when it changes. */
  protected readonly clockChars = computed(() => {
    const minutes = this.calmClock();
    return [...(minutes === null ? this.clock() : String(minutes))];
  });
  /** Only after the first render, so opening the timer doesn't roll every digit at once. */
  private readonly rendered = signal(false);
  protected readonly rolling = computed(
    () => this.rendered() && this.store.settings().animateDigits,
  );
  /** The time of day the running phase ends, when that's turned on. */
  protected readonly endsAt = computed(() => {
    const { status, endTime } = this.store.state();
    return this.store.settings().showEndsAt && status === 'running' && endTime !== null
      ? formatTime(endTime)
      : null;
  });
  protected minutesText(n: number): string {
    return `${n} ${n === 1 ? 'minute' : 'minutes'}`;
  }
  // The bar empties as time passes, like sand running out.
  protected readonly percentLeft = computed(() => Math.round(100 * (1 - this.store.progress())));
  /** Whole minutes, so screen readers aren't flooded with a new value every second. */
  protected readonly timeLeftText = computed(() => {
    const total = Math.round(this.store.totalMs() / 60_000);
    const left = Math.ceil(this.store.remainingMs() / 60_000);
    return `${left} of ${total} ${total === 1 ? 'minute' : 'minutes'} left`;
  });

  /** After a few focus sessions in a row, this break's line is a reminder to look after yourself. */
  protected readonly care = computed(() => {
    const state = this.store.state();
    return state.status === 'paused' ? null : careNudge(state, this.store.settings());
  });

  /** How many times "Another idea" was pressed on this break. */
  private readonly ideaOffset = signal(0);
  /** A screen-free suggestion for this break, the same each time the popup opens. */
  protected readonly idea = computed(() => {
    const { phase, status, todayKey, completedToday } = this.store.state();
    if (!this.store.settings().breakIdeas || status === 'paused' || this.care()) return null;
    return breakIdea(phase, `${todayKey}:${completedToday}:${phase}`, this.ideaOffset());
  });

  /** The last minute of a running phase, when the heads-up is on. */
  protected readonly headsUp = computed(() => {
    this.store.remainingMs(); // ticks while the timer runs
    return inHeadsUp(this.store.state(), this.store.settings(), Date.now());
  });

  /** The settle-in breathing before focus, or null when it isn't happening. */
  protected readonly breath = computed(() => {
    const state = this.store.state();
    const now = Math.max(this.store.tick(), Date.now());
    return settling(state, now) ? breathAt(state, now) : null;
  });
  /** Starts the bar's breathing animation partway through when the popup opens mid-breath. */
  protected readonly breathDelay = computed(() => {
    const until = this.store.state().settleUntil ?? 0;
    return until - SETTLE_MS - Date.now();
  });

  // ---- Small wins ----

  /** The celebration line, shown for a few seconds after a focus session finishes. */
  protected readonly win = signal<string | null>(null);
  private winTimer: ReturnType<typeof setTimeout> | undefined;

  private celebrate(): void {
    const at = this.store.state().lastFocusEnd;
    const line = smallWin(this.store.state(), this.store.settings(), readCelebrated(), Date.now());
    if (!line || at === undefined) return;
    // Once per session, even if the timer opens again in a minute.
    writeCelebrated(at);
    this.win.set(line);
    clearTimeout(this.winTimer);
    this.winTimer = setTimeout(() => this.win.set(null), WIN_SHOWN_MS);
  }

  protected readonly live = computed(() => (this.breath() ? null : 'polite'));
  protected readonly settleAnnouncement = computed(() =>
    this.breath() ? 'Settling in. Focus starts in 30 seconds.' : '',
  );

  protected readonly status = computed(() => {
    const { phase, status, extending } = this.store.state();
    const breath = this.breath();
    if (breath) return breath === 'in' ? 'Breathe in…' : 'Breathe out…';
    const win = this.win();
    if (win) return win;
    if (this.headsUp()) {
      return phase === 'work'
        ? '1 minute left: find a stopping point'
        : '1 minute left on your break';
    }
    const care = this.care();
    if (care) return care;
    const idea = this.idea();
    if (idea) return idea;
    if (extending && status === 'running') return 'Extra time. Your break is waiting';
    if (status === 'running') return phase === 'work' ? 'Stay focused' : 'Take a breather';
    if (status === 'paused' && this.store.state().away) return 'Paused while you were away';
    if (status === 'paused')
      return this.stillPaused() ? 'Still paused. Pick it back up?' : 'Paused';
    return phase === 'work' ? 'Ready to focus' : 'Time for a break';
  });

  /** A short first session for when a full one feels like too much to begin. */
  protected readonly justStartOffer = computed(() =>
    canJustStart(this.store.state(), this.store.settings()),
  );
  protected readonly justStartMinutes = JUST_START_MINUTES;

  /** Rhythm presets, offered while a focus session is waiting to start. */
  protected readonly rhythms = RHYTHMS;
  protected readonly rhythmOffer = computed(() => {
    const { phase, status, extending } = this.store.state();
    return (
      this.store.settings().rhythmPresets && phase === 'work' && status === 'idle' && !extending
    );
  });
  protected readonly rhythm = computed(() => rhythmOf(this.store.settings()));

  /** Still in the flow when focus ends? A few more minutes before the break. */
  protected readonly keepGoingOffer = computed(() =>
    canKeepGoing(this.store.state(), this.store.settings()),
  );
  protected readonly keepGoingMinutes = KEEP_GOING_MINUTES;

  /** Paused long enough for the "still paused?" reminder. */
  private readonly stillPaused = computed(() => {
    const at = pauseNudgeAt(this.store.state(), this.store.settings());
    return at !== null && Math.max(this.minute(), Date.now()) >= at;
  });

  protected readonly primaryLabel = computed(() => {
    const status = this.store.state().status;
    return status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : 'Start';
  });

  protected readonly cycleDots = computed(() => {
    const done = this.store.state().completedInCycle;
    return Array.from(
      { length: this.store.settings().sessionsBeforeLongBreak },
      (_, i) => i < done,
    );
  });

  protected readonly cycleText = computed(() => {
    const total = this.cycleDots().length;
    return `${this.store.state().completedInCycle} of ${total} focus ${total === 1 ? 'session' : 'sessions'} done before a long break`;
  });

  // ---- Plan my day ----

  /** The plan's finish time moves with the clock even while the timer sits idle. */
  private readonly minute = signal(Date.now());
  protected readonly plan = this.store.todayPlan;
  protected readonly planDone = computed(() => this.store.state().completedToday);
  /** "6 of 6 planned, +1 bonus" reads better than "7 of 6". */
  protected readonly planShown = computed(() =>
    Math.min(this.planDone(), this.plan()?.pomodoros ?? 0),
  );

  /** One segment per planned pomodoro, plus bonus ones past the plan. */
  protected readonly planSegments = computed(() => {
    const plan = this.plan();
    if (!plan) return [];
    const done = this.planDone();
    const total = Math.min(32, Math.max(plan.pomodoros, done));
    return Array.from({ length: total }, (_, i) =>
      i >= plan.pomodoros ? 'bonus' : i < done ? 'done' : 'todo',
    );
  });

  /** "done around 12:45 PM", "+2 bonus", or nothing once the estimate runs past midnight. */
  protected readonly planNote = computed(() => {
    const plan = this.plan();
    if (!plan) return '';
    const done = this.planDone();
    if (done > plan.pomodoros) return `+${done - plan.pomodoros} bonus`;
    if (done === plan.pomodoros) return '';
    this.store.remainingMs(); // ticks while the timer runs
    const now = Math.max(this.minute(), Date.now());
    const { endsAt } = planSchedule(
      plan.pomodoros - done,
      this.store.state(),
      this.store.settings(),
      now,
    );
    return isAfterToday(endsAt, now) ? '' : `done around ${formatTime(endsAt)}`;
  });

  protected readonly planLabel = computed(() => {
    const plan = this.plan();
    if (!plan) return '';
    const done = this.planDone();
    if (done === plan.pomodoros) {
      return `Today's plan: all ${done} pomodoros done. Anything more is a bonus. Change plan`;
    }
    const note = this.planNote().replace(/^done around/, 'finishing around');
    const shown = Math.min(done, plan.pomodoros);
    return `Today's plan: ${shown} of ${plan.pomodoros} pomodoros done${note ? `, ${note}` : ''}. Change plan`;
  });

  /** The label for the pomodoro in progress, or the next one during a break. */
  /** Start asks for the first tiny step before a fresh focus session. */
  private readonly asking = signal(false);
  protected readonly askStep = computed(
    () => this.asking() && canAskFirstStep(this.store.state(), this.store.settings()),
  );
  protected readonly maxStep = MAX_STEP_LENGTH;

  protected readonly planLabelNow = computed(() => {
    // The step you named for this session is the most useful thing to see.
    const { phase, firstStep } = this.store.state();
    if (phase === 'work' && firstStep) return { prefix: 'First step', label: firstStep };
    // Extra time goes with the pomodoro that just finished.
    const index = this.planDone() - (this.store.state().extending ? 1 : 0);
    const label = this.plan()?.labels[index];
    if (!label) return null;
    return { prefix: this.store.state().phase === 'work' ? 'Now' : 'Next', label };
  });

  constructor() {
    afterNextRender(() => this.rendered.set(true));
    // Only a change of status counts, so a running timer's other updates leave it open.
    const status = computed(() => this.store.state().status);
    effect(() => {
      if (status() === 'running') untracked(() => this.showAll.set(false));
    });
    // A new break starts back at its own idea.
    effect(() => {
      this.phase();
      untracked(() => this.ideaOffset.set(0));
    });
    const id = setInterval(() => this.minute.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(id);
      clearTimeout(this.parkedTimer);
      clearTimeout(this.winTimer);
    });
    // A focus session just finished (or did while the popup was closed): celebrate it once.
    const finished = computed(() => this.store.state().lastFocusEnd);
    effect(() => {
      finished();
      this.phase();
      this.store.settings().smallWins;
      untracked(() => this.celebrate());
    });
    // The quick-park box belongs to focus; a break closes it.
    effect(() => {
      if (!this.quickPark()) untracked(() => this.parkOpen.set(false));
    });
  }

  protected async skipPlan(): Promise<void> {
    await this.store.skipPlanToday();
    // The card's button is gone, so keep keyboard focus nearby.
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('.plan-add')?.focus(),
      { injector: this.injector },
    );
  }

  /** Turns on one helper from the card. Once both are on, the card has done its job. */
  protected async turnOn(helper: 'parkingLot' | 'breakIdeas'): Promise<void> {
    const next = { ...this.store.settings(), [helper]: true };
    await this.store.updateSettings(next);
    if (next.parkingLot && next.breakIdeas) await this.store.dismissHelpersTip();
    // The button is gone (or the whole card is), so keep keyboard focus nearby.
    afterNextRender(
      () =>
        (
          this.host.nativeElement.querySelector<HTMLElement>('.helpers-card .pill-btn') ??
          this.host.nativeElement.querySelector<HTMLElement>('.primary-btn')
        )?.focus(),
      { injector: this.injector },
    );
  }

  protected async noThanks(): Promise<void> {
    await this.store.dismissHelpersTip();
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('.primary-btn')?.focus(),
      { injector: this.injector },
    );
  }

  // ---- Park a thought without leaving the timer ----

  /** Offered during focus, when the parking lot is on. */
  protected readonly quickPark = computed(
    () => this.store.settings().parkingLot && this.store.state().phase === 'work',
  );
  protected readonly parkOpen = signal(false);
  protected readonly maxThought = MAX_THOUGHT_LENGTH;
  /** A brief "Parked" in place of the link after parking. */
  protected readonly justParked = signal(false);
  private parkedTimer: ReturnType<typeof setTimeout> | undefined;

  protected openPark(): void {
    this.parkOpen.set(true);
    this.focusSoon('#quick-thought');
  }

  protected closePark(): void {
    this.parkOpen.set(false);
    this.focusSoon('.park-link');
  }

  protected async park(input: HTMLInputElement): Promise<void> {
    if (!input.value.trim()) {
      this.closePark();
      return;
    }
    await this.store.parkThought(input.value);
    this.parkOpen.set(false);
    this.justParked.set(true);
    clearTimeout(this.parkedTimer);
    this.parkedTimer = setTimeout(() => this.justParked.set(false), 2500);
    this.focusSoon('.primary-btn');
  }

  private focusSoon(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }

  protected anotherIdea(): void {
    this.ideaOffset.update((n) => n + 1);
  }

  protected async rateEnergy(level: Energy): Promise<void> {
    await this.store.send({ command: 'rateEnergy', level });
    this.focusSoon('.primary-btn');
  }

  protected async notTonight(): Promise<void> {
    await this.store.markWrappedUp();
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('.primary-btn')?.focus(),
      {
        injector: this.injector,
      },
    );
  }

  protected async parkLater(): Promise<void> {
    await this.store.markParkingSeen();
    // The card's buttons are gone, so hand focus to the parking lot button up top.
    afterNextRender(() => document.querySelector<HTMLElement>('[data-view="parking"]')?.focus(), {
      injector: this.injector,
    });
  }

  protected toggle(): void {
    if (this.store.state().status === 'running') {
      void this.store.send({ command: 'pause' });
    } else if (canAskFirstStep(this.store.state(), this.store.settings())) {
      this.asking.set(true);
      this.focusSoon('#first-step');
    } else {
      void this.store.send({ command: 'start' });
    }
  }

  /** Starts focus with the step typed in, or with none when the box is empty ("Skip"). */
  protected startWithStep(step: string): void {
    this.asking.set(false);
    void this.store.send(step.trim() ? { command: 'start', step } : { command: 'start' });
    this.focusSoon('.primary-btn');
  }

  protected cancelStep(): void {
    this.asking.set(false);
    this.focusSoon('.primary-btn');
  }

  protected justStart(): void {
    void this.store.send({ command: 'justStart' });
    // The link goes away once the timer runs, so keep keyboard focus on the controls.
    this.focusSoon('.primary-btn');
  }

  /** Back from an "away" pause. Reading or thinking away from the keys still counts. */
  protected readonly awayOffer = computed(() => {
    const { status, away } = this.store.state();
    return status === 'paused' && away === true;
  });

  protected wasWorking(): void {
    void this.store.send({ command: 'wasWorking' });
    this.focusSoon('.primary-btn');
  }

  protected skipSettle(): void {
    void this.store.send({ command: 'skipSettle' });
    this.focusSoon('.primary-btn');
  }

  protected keepGoing(): void {
    void this.store.send({ command: 'keepGoing' });
    this.focusSoon('.primary-btn');
  }

  protected reset(): void {
    void this.store.send({ command: 'reset' });
  }

  protected skip(): void {
    void this.store.send({ command: 'skip' });
  }

  /** The timer resets itself to the new length, since it hasn't started. */
  protected chooseRhythm(id: RhythmId): void {
    if (id !== this.rhythm())
      void this.store.updateSettings(applyRhythm(this.store.settings(), id));
  }

  protected choosePhase(phase: Phase): void {
    if (phase !== this.store.state().phase) void this.store.send({ command: 'setPhase', phase });
  }

  /** Optional single-key shortcuts. Off by default, so typing never sets one off by surprise. */
  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if (!this.store.settings().shortcuts) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, [contenteditable]')) return;
    const action = SHORTCUTS[event.key.toLowerCase()];
    if (!action || !this.full()) return;
    event.preventDefault();
    if (action === 'skip') this.skip();
    else if (action === 'reset') this.reset();
    else if (this.quickPark() && !this.parkOpen()) this.openPark();
  }

  @HostListener('document:keydown.space', ['$event'])
  protected onSpace(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea')) return;
    event.preventDefault();
    this.toggle();
  }
}

/** Keyboard shortcuts on the timer screen, when they're turned on. */
const SHORTCUTS: Record<string, 'skip' | 'reset' | 'park'> = { s: 'skip', r: 'reset', p: 'park' };

/** How long the small-wins line stays before the usual status comes back. */
const WIN_SHOWN_MS = 5_000;
const CELEBRATED_KEY = 'tomomomento.celebrated';

function readCelebrated(): number | null {
  try {
    const value = Number(localStorage.getItem(CELEBRATED_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeCelebrated(at: number): void {
  try {
    localStorage.setItem(CELEBRATED_KEY, String(at));
  } catch {
    // Private browsing: it may celebrate again next time, which is fine.
  }
}
