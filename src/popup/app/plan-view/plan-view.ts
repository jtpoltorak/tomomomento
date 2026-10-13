import { Component, computed, DestroyRef, inject, output, signal } from '@angular/core';
import {
  formatTime,
  isAfterToday,
  MAX_LABEL_LENGTH,
  MAX_PLAN,
  MIN_PLAN,
  planSchedule,
} from '../../../shared/plan';
import { formatMinutes } from '../../../shared/stats';
import { PomodoroStore } from '../pomodoro-store';

const QUICK_PICKS = [2, 4, 6, 8];

@Component({
  selector: 'app-plan-view',
  templateUrl: './plan-view.html',
  styleUrl: './plan-view.css',
})
export class PlanView {
  protected readonly store = inject(PomodoroStore);
  /** Saved or cleared: back to the timer. */
  readonly done = output<void>();

  protected readonly min = MIN_PLAN;
  protected readonly max = MAX_PLAN;
  protected readonly maxLabel = MAX_LABEL_LENGTH;
  protected readonly picks = QUICK_PICKS;

  private readonly existing = this.store.todayPlan();
  protected readonly hasPlan = this.existing !== null;
  protected readonly count = signal(this.existing?.pomodoros ?? this.store.plan().lastCount);
  protected readonly labels = signal<string[]>([...(this.existing?.labels ?? [])]);
  protected readonly labelsOpen = this.labels().some(Boolean);

  /** The finish time moves with the clock even while the timer sits idle. */
  private readonly now = signal(Date.now());

  protected readonly finished = computed(() => this.store.state().completedToday);
  protected readonly left = computed(() => Math.max(0, this.count() - this.finished()));
  protected readonly schedule = computed(() => {
    this.store.remainingMs(); // ticks while the timer runs
    return planSchedule(this.left(), this.store.state(), this.store.settings(), this.now());
  });
  protected readonly startTime = computed(() => formatTime(this.now()));
  protected readonly pastMidnight = computed(() =>
    isAfterToday(this.schedule().endsAt, this.now()),
  );
  protected readonly endTime = computed(() => formatTime(this.schedule().endsAt));
  protected readonly indexes = computed(() => Array.from({ length: this.count() }, (_, i) => i));

  protected readonly summary = computed(() => {
    const count = this.count();
    const done = this.finished();
    if (done >= count) {
      return `You've done ${this.pomodoros(done)} today, so this plan is already done. Anything more is a bonus.`;
    }
    const lead =
      done > 0
        ? `${done} done, ${this.left()} to go.`
        : `${formatMinutes(count * this.store.settings().workMinutes)} of focus.`;
    if (this.pastMidnight()) return `${lead} That would run past midnight.`;
    const idle = this.store.state().status === 'idle';
    return `${lead} ${idle ? 'Start now and you’d' : 'You’d'} be done around ${this.endTime()}.`;
  });

  constructor() {
    const id = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  protected pomodoros(n: number): string {
    return n === 1 ? '1 pomodoro' : `${n} pomodoros`;
  }

  protected change(delta: number): void {
    this.count.update((n) => Math.min(MAX_PLAN, Math.max(MIN_PLAN, n + delta)));
  }

  protected setLabel(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.labels.update((labels) => {
      const next = [...labels];
      while (next.length <= index) next.push('');
      next[index] = value;
      return next;
    });
  }

  protected async save(): Promise<void> {
    await this.store.savePlan(this.count(), this.labels());
    this.done.emit();
  }

  protected async clear(): Promise<void> {
    await this.store.clearPlan();
    this.done.emit();
  }
}
