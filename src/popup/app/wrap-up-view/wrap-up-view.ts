import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
} from '@angular/core';
import { thoughtsText } from '../../../shared/parking';
import { PomodoroStore } from '../pomodoro-store';

/**
 * The day wrap-up: the day's parked thoughts, one at a time, each kept for
 * tomorrow, marked done, or let go. Done and let go both clear the thought;
 * nothing records which, so it's only about how it feels to put it down.
 */
@Component({
  selector: 'app-wrap-up-view',
  templateUrl: './wrap-up-view.html',
  styleUrl: './wrap-up-view.css',
})
export class WrapUpView {
  protected readonly store = inject(PomodoroStore);
  readonly finished = output<void>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** The thoughts as they stood when the wrap-up began, so new ones don't join midway. */
  private readonly queue = this.store.parkingLot().thoughts.map((t) => t.id);
  protected readonly total = this.queue.length;
  protected readonly index = signal(0);
  protected readonly current = computed(() => {
    const id = this.queue[this.index()];
    return this.store.parkingLot().thoughts.find((t) => t.id === id) ?? null;
  });

  private readonly kept = signal(0);
  private readonly cleared = signal(0);
  protected readonly summary = computed(() => {
    const kept = this.kept();
    const cleared = this.cleared();
    if (!kept && !cleared) return 'Nothing was parked.';
    const parts = [];
    if (cleared) parts.push(`${thoughtsText(cleared)} cleared`);
    if (kept) parts.push(`${kept} kept for tomorrow`);
    return `${parts.join(', ')}.`;
  });

  constructor() {
    // Starting counts as today's wrap-up, so the card won't ask again tonight.
    void this.store.markWrappedUp();
  }

  protected keep(): void {
    this.kept.update((n) => n + 1);
    this.next();
  }

  protected async clear(): Promise<void> {
    const t = this.current();
    if (!t) return;
    this.cleared.update((n) => n + 1);
    await this.store.removeThought(t.id);
    this.next();
  }

  private next(): void {
    this.index.update((i) => i + 1);
    // Whatever's left has been looked at, so the break card stays quiet.
    if (!this.current()) void this.store.markParkingSeen();
    // Each step replaces the buttons, so screen readers hear the next thought (or the end).
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('.thought, .all-sorted')?.focus(),
      { injector: this.injector },
    );
  }
}
