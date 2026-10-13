import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  Injector,
  output,
  signal,
} from '@angular/core';
import { formatTime, isAfterToday, planSchedule } from '../../../shared/plan';
import { pickQuote, type Quote } from '../../../shared/quotes';
import { formatClock, PHASE_LABELS, type Phase } from '../../../shared/timer';
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
  // The popup only has room for one extra line of text under the controls, so
  // the daily plan card and your own label for this pomodoro come before a quote.
  protected readonly quote = computed(() =>
    this.store.settings().showQuotes && !this.store.showPlanPrompt() && !this.planLabelNow()
      ? this.phaseQuote()
      : null,
  );
  // Anyone who turned on quotes or planning has been through Settings and seen
  // the alert options, so they don't need the hint.
  protected readonly showAlertHint = computed(() => {
    const s = this.store.settings();
    return (
      this.store.alertsOff() && !this.store.alertHintDismissed() && !s.showQuotes && !s.planEnabled
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

  protected readonly status = computed(() => {
    const { phase, status } = this.store.state();
    if (status === 'running') return phase === 'work' ? 'Stay focused' : 'Take a breather';
    if (status === 'paused') return 'Paused';
    return phase === 'work' ? 'Ready to focus' : 'Time for a break';
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
  protected readonly planLabelNow = computed(() => {
    const label = this.plan()?.labels[this.planDone()];
    if (!label) return null;
    return { prefix: this.store.state().phase === 'work' ? 'Now' : 'Next', label };
  });

  constructor() {
    const id = setInterval(() => this.minute.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  protected async skipPlan(): Promise<void> {
    await this.store.skipPlanToday();
    // The card's button is gone, so keep keyboard focus nearby.
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('.plan-add')?.focus(),
      { injector: this.injector },
    );
  }

  protected toggle(): void {
    void this.store.send({ command: this.store.state().status === 'running' ? 'pause' : 'start' });
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
