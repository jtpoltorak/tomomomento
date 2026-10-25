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
  /** Tells the app to show the timer after "Start focus on it". */
  readonly started = output<void>();

  /** Pick for me: with two or more thoughts, one button chooses for you. */
  protected readonly pickOn = computed(
    () => this.store.settings().pickForMe && this.thoughts().length > 1,
  );
  /** The thought the highlight is on while it hops around, then the one picked. */
  protected readonly lit = signal<string | null>(null);
  protected readonly picking = signal(false);
  private readonly pickedId = signal<string | null>(null);
  protected readonly picked = computed(
    () => this.thoughts().find((t) => t.id === this.pickedId()) ?? null,
  );
  /** Only a focus session that hasn't started yet can start on the picked thought. */
  protected readonly canStart = computed(() => {
    const { phase, status } = this.store.state();
    return phase === 'work' && status === 'idle';
  });

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

  /** Hops the highlight around the list for a moment, like a game show, then lands on one. */
  protected pick(): void {
    const choices = this.thoughts().filter((t) => t.id !== this.pickedId());
    const choice = choices[Math.floor(Math.random() * choices.length)];
    if (!choice) return;
    const done = () => {
      this.picking.set(false);
      this.lit.set(choice.id);
      this.pickedId.set(choice.id);
    };
    const calm =
      document.documentElement.dataset['motion'] === 'reduce' ||
      (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    if (calm) return done();
    this.picking.set(true);
    this.pickedId.set(null);
    let hops = 0;
    const timer = setInterval(() => {
      const all = this.thoughts();
      this.lit.set(all[hops % all.length]?.id ?? null);
      if (++hops >= PICK_HOPS) {
        clearInterval(timer);
        done();
      }
    }, PICK_HOP_MS);
  }

  /** Starts a fresh focus session with the picked thought as its first tiny step. */
  protected async startOn(text: string): Promise<void> {
    await this.store.send({ command: 'start', step: text });
    this.started.emit();
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

/** How the highlight hops before it lands: about a second in all. */
const PICK_HOPS = 9;
const PICK_HOP_MS = 110;
