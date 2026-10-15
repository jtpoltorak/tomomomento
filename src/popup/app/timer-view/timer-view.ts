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
import { MAX_THOUGHT_LENGTH, thoughtsText } from '../../../shared/parking';
import { pickQuote, type Quote } from '../../../shared/quotes';
import {
  canJustStart,
  canKeepGoing,
  formatClock,
  inHeadsUp,
  JUST_START_MINUTES,
  KEEP_GOING_MINUTES,
  PHASE_LABELS,
  type Phase,
} from '../../../shared/timer';
import { PomodoroStore } from '../pomodoro-store';

@Component({
  selector: 'app-timer-view',
  templateUrl: './timer-view.html',
  styleUrl: './timer-view.css',
})
export class TimerView {
  protected readonly store = inject(PomodoroStore);
  readonly openSettings = output<void>();
  readonly openPlan = output<void>();
  readonly openParking = output<void>();
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
  /** On a break, how many thoughts were parked since you last looked. The plan card comes first. */
  protected readonly parkedCard = computed(() =>
    this.store.showPlanPrompt() || this.helpersCard() ? 0 : this.store.parkedOnBreak(),
  );
  protected readonly parkedText = computed(() => thoughtsText(this.parkedCard()));
  // The popup only has room for one extra line of text under the controls, so
  // the daily plan card, the parked thoughts card and your own label for this
  // pomodoro come before a quote.
  protected readonly quote = computed(() =>
    this.store.settings().showQuotes &&
    !this.store.showPlanPrompt() &&
    !this.helpersCard() &&
    !this.parkedCard() &&
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

  protected readonly clock = computed(() => formatClock(this.store.remainingMs()));
  // The bar empties as time passes, like sand running out.
  protected readonly percentLeft = computed(() => Math.round(100 * (1 - this.store.progress())));
  /** Whole minutes, so screen readers aren't flooded with a new value every second. */
  protected readonly timeLeftText = computed(() => {
    const total = Math.round(this.store.totalMs() / 60_000);
    const left = Math.ceil(this.store.remainingMs() / 60_000);
    return `${left} of ${total} ${total === 1 ? 'minute' : 'minutes'} left`;
  });

  /** How many times "Another idea" was pressed on this break. */
  private readonly ideaOffset = signal(0);
  /** A screen-free suggestion for this break, the same each time the popup opens. */
  protected readonly idea = computed(() => {
    const { phase, status, todayKey, completedToday } = this.store.state();
    if (!this.store.settings().breakIdeas || status === 'paused') return null;
    return breakIdea(phase, `${todayKey}:${completedToday}:${phase}`, this.ideaOffset());
  });

  /** The last minute of a running phase, when the heads-up is on. */
  protected readonly headsUp = computed(() => {
    this.store.remainingMs(); // ticks while the timer runs
    return inHeadsUp(this.store.state(), this.store.settings(), Date.now());
  });

  protected readonly status = computed(() => {
    const { phase, status, extending } = this.store.state();
    if (this.headsUp()) {
      return phase === 'work'
        ? '1 minute left: find a stopping point'
        : '1 minute left on your break';
    }
    const idea = this.idea();
    if (idea) return idea;
    if (extending && status === 'running') return 'Extra time. Your break is waiting';
    if (status === 'running') return phase === 'work' ? 'Stay focused' : 'Take a breather';
    if (status === 'paused') return 'Paused';
    return phase === 'work' ? 'Ready to focus' : 'Time for a break';
  });

  /** A short first session for when a full one feels like too much to begin. */
  protected readonly justStartOffer = computed(() =>
    canJustStart(this.store.state(), this.store.settings()),
  );
  protected readonly justStartMinutes = JUST_START_MINUTES;

  /** Still in the flow when focus ends? A few more minutes before the break. */
  protected readonly keepGoingOffer = computed(() =>
    canKeepGoing(this.store.state(), this.store.settings()),
  );
  protected readonly keepGoingMinutes = KEEP_GOING_MINUTES;

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
  protected readonly planLabelNow = computed(() => {
    // Extra time goes with the pomodoro that just finished.
    const index = this.planDone() - (this.store.state().extending ? 1 : 0);
    const label = this.plan()?.labels[index];
    if (!label) return null;
    return { prefix: this.store.state().phase === 'work' ? 'Now' : 'Next', label };
  });

  constructor() {
    // A new break starts back at its own idea.
    effect(() => {
      this.phase();
      untracked(() => this.ideaOffset.set(0));
    });
    const id = setInterval(() => this.minute.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(id);
      clearTimeout(this.parkedTimer);
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

  protected async parkLater(): Promise<void> {
    await this.store.markParkingSeen();
    // The card's buttons are gone, so hand focus to the parking lot button up top.
    afterNextRender(() => document.querySelector<HTMLElement>('[data-view="parking"]')?.focus(), {
      injector: this.injector,
    });
  }

  protected toggle(): void {
    void this.store.send({ command: this.store.state().status === 'running' ? 'pause' : 'start' });
  }

  protected justStart(): void {
    void this.store.send({ command: 'justStart' });
    // The link goes away once the timer runs, so keep keyboard focus on the controls.
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

  protected choosePhase(phase: Phase): void {
    if (phase !== this.store.state().phase) void this.store.send({ command: 'setPhase', phase });
  }

  @HostListener('document:keydown.space', ['$event'])
  protected onSpace(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea')) return;
    event.preventDefault();
    this.toggle();
  }
}
