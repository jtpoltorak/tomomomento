import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import {
  formatMinutes,
  heatLevel,
  heatmap,
  lastDays,
  summarize,
  type Day,
} from '../../../shared/stats';
import { PomodoroStore } from '../pomodoro-store';

const HEATMAP_WEEKS = 16;

@Component({
  selector: 'app-stats-view',
  templateUrl: './stats-view.html',
  styleUrl: './stats-view.css',
})
export class StatsView {
  private readonly store = inject(PomodoroStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Re-read when the history or timer changes, so the view rolls over to a new day with them. */
  private readonly now = computed(() => {
    this.store.history();
    this.store.state();
    return Date.now();
  });

  protected readonly summary = computed(() => summarize(this.store.history(), this.now()));
  protected readonly tiles = computed(() => {
    const s = this.summary();
    return [
      { label: 'Today', totals: s.today },
      { label: 'Last 7 days', totals: s.last7Days },
      { label: 'This month', totals: s.thisMonth },
      { label: 'All time', totals: s.allTime },
    ];
  });
  protected readonly empty = computed(() => this.summary().allTime.pomodoros === 0);

  protected readonly week = computed(() => lastDays(this.store.history(), this.now(), 7));
  /** Bars share one scale, with a floor so a single pomodoro doesn't fill the chart. */
  protected readonly weekMax = computed(() => Math.max(4, ...this.week().map((d) => d.pomodoros)));

  protected readonly weeks = computed(() =>
    heatmap(this.store.history(), this.now(), HEATMAP_WEEKS),
  );
  protected readonly heatSummary = computed(() => {
    const days = this.weeks()
      .flatMap((w) => w.days)
      .filter((d): d is Day => d !== null && d.pomodoros > 0);
    if (days.length === 0) return `No focus sessions in the last ${HEATMAP_WEEKS} weeks yet.`;
    const best = days.reduce((a, b) => (b.pomodoros > a.pomodoros ? b : a));
    const count = days.length === 1 ? '1 day' : `${days.length} days`;
    return `${count} with focus in the last ${HEATMAP_WEEKS} weeks. Best day: ${this.longDate(best)}, ${this.pomodoros(best.pomodoros)}.`;
  });

  protected readonly confirming = signal(false);

  protected readonly formatMinutes = formatMinutes;
  protected readonly heatLevel = heatLevel;

  protected pomodoros(n: number): string {
    return n === 1 ? '1 pomodoro' : `${n} pomodoros`;
  }

  protected shortDay(day: Day, isToday: boolean): string {
    return isToday ? 'Today' : day.date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  protected longDate(day: Day): string {
    return day.date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  protected askReset(): void {
    this.confirming.set(true);
    this.focus('.confirm .cancel');
  }

  protected cancelReset(): void {
    this.confirming.set(false);
    this.focus('.reset');
  }

  protected async confirmReset(): Promise<void> {
    this.confirming.set(false);
    this.focus('.reset');
    await this.store.resetStats();
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
