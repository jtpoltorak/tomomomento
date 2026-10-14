import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { MAX_THOUGHT_LENGTH, MAX_THOUGHTS, thoughtsText } from '../../../shared/parking';
import { PomodoroStore } from '../pomodoro-store';

@Component({
  selector: 'app-parking-view',
  templateUrl: './parking-view.html',
  styleUrl: './parking-view.css',
})
export class ParkingView {
  protected readonly store = inject(PomodoroStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly maxLength = MAX_THOUGHT_LENGTH;
  protected readonly thoughts = computed(() => this.store.parkingLot().thoughts);
  protected readonly heading = computed(() => {
    const n = this.thoughts().length;
    return n === 0 ? 'Parked' : `Parked (${n})`;
  });
  /** Said once after each park or clear, for everyone and for screen readers. */
  protected readonly message = signal('');
  protected readonly confirming = signal(false);

  constructor() {
    // Looking here counts as seeing what's parked, so the break card stays quiet.
    void this.store.markParkingSeen();
  }

  protected async park(input: HTMLInputElement): Promise<void> {
    const text = input.value.trim();
    if (!text) return;
    const full = this.thoughts().length >= MAX_THOUGHTS;
    await this.store.parkThought(text);
    input.value = '';
    const onFocus = this.store.state().phase === 'work';
    this.message.set(
      full
        ? `Parked. The oldest thought made room, since the lot holds ${MAX_THOUGHTS}.`
        : onFocus
          ? 'Parked. It will be here on your break.'
          : 'Parked.',
    );
  }

  protected async done(id: string): Promise<void> {
    const index = this.thoughts().findIndex((t) => t.id === id);
    await this.store.removeThought(id);
    // The button that had focus is gone, so move to the next one, or back to the box.
    const buttons = this.host.nativeElement.querySelectorAll<HTMLElement>('.done');
    const next = buttons[Math.min(index, buttons.length - 1)];
    this.focus(next ? null : '#thought', next);
  }

  protected askClear(): void {
    this.confirming.set(true);
    this.focus('.confirm .cancel');
  }

  protected cancelClear(): void {
    this.confirming.set(false);
    this.focus('.clear');
  }

  protected async confirmClear(): Promise<void> {
    const n = this.thoughts().length;
    this.confirming.set(false);
    await this.store.clearThoughts();
    this.message.set(`Cleared ${thoughtsText(n)}.`);
    this.focus('#thought');
  }

  private focus(selector: string | null, el?: HTMLElement): void {
    afterNextRender(
      () => {
        const target =
          el && el.isConnected
            ? el
            : this.host.nativeElement.querySelector<HTMLElement>(selector ?? '#thought');
        target?.focus();
      },
      { injector: this.injector },
    );
  }
}
