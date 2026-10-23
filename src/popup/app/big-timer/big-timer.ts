import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  output,
} from '@angular/core';
import { calmMinutes, formatClock, PHASE_LABELS } from '../../../shared/timer';
import { PomodoroStore } from '../pomodoro-store';

/**
 * The big timer view: the clock fills the whole window and the phase color
 * drains down the screen as time passes, readable from across the room.
 */
@Component({
  selector: 'app-big-timer',
  template: `
    <div class="fill" aria-hidden="true">
      <div class="fill-left" [style.transform]="'scaleY(' + (1 - store.progress()) + ')'"></div>
    </div>
    <button type="button" class="close" (click)="closed.emit()" aria-label="Close the big timer">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"
        />
      </svg>
    </button>
    <h1 class="phase">{{ phase() }}</h1>
    <div class="clock" role="timer" [attr.aria-label]="label()">
      {{ clock() }}
      @if (calm()) {
        <span class="unit" aria-hidden="true">min</span>
      }
    </div>
    <button type="button" class="go" (click)="toggle()">{{ primaryLabel() }}</button>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
      padding: 1.5rem;
      background: var(--bg);
      color: var(--fg);
    }
    .fill {
      position: absolute;
      inset: 0;
      z-index: -1;
      overflow: hidden;
    }
    /* The phase color, softened so text keeps its contrast, sinking as time runs out. */
    .fill-left {
      width: 100%;
      height: 100%;
      background: color-mix(in srgb, var(--accent) 22%, var(--bg));
      transform-origin: bottom;
      transition:
        transform 0.3s linear,
        background 0.3s;
    }
    .phase {
      margin: 0;
      font-size: clamp(1.5rem, 4vw, 3rem);
      font-weight: 600;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .clock {
      font-size: min(26vw, 48vh);
      font-weight: 600;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
    .unit {
      font-size: 0.25em;
      font-weight: 400;
      color: var(--muted);
    }
    .go {
      min-width: 12rem;
      padding: 1rem 2.5rem;
      border: 0;
      border-radius: 999px;
      background: var(--accent);
      color: var(--on-accent);
      font: inherit;
      font-size: 1.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .go:hover {
      filter: brightness(1.08);
    }
    .close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      display: grid;
      place-items: center;
      width: 3rem;
      height: 3rem;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--fg);
      cursor: pointer;
    }
    .close:hover {
      background: var(--surface);
    }
    .close svg {
      width: 1.75rem;
      height: 1.75rem;
      fill: currentColor;
    }
    @media (forced-colors: active) {
      .fill-left {
        background: Highlight;
        opacity: 0.25;
      }
      .go {
        border: 2px solid ButtonText;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .fill-left {
        transition: none;
      }
    }
  `,
})
export class BigTimer {
  protected readonly store = inject(PomodoroStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly closed = output<void>();

  protected readonly phase = computed(() => PHASE_LABELS[this.store.state().phase]);
  /** Whole minutes with the calm clock on, so the big view doesn't tick either. */
  protected readonly calm = computed(() => this.store.settings().calmClock);
  protected readonly clock = computed(() =>
    this.calm()
      ? String(calmMinutes(this.store.remainingMs()))
      : formatClock(this.store.remainingMs()),
  );
  /** Whole minutes, so screen readers aren't flooded with a new value every second. */
  protected readonly label = computed(() => {
    const left = Math.ceil(this.store.remainingMs() / 60_000);
    return `${left} ${left === 1 ? 'minute' : 'minutes'} left`;
  });
  protected readonly primaryLabel = computed(() => {
    const status = this.store.state().status;
    return status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : 'Start';
  });

  constructor() {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.go')?.focus());
  }

  protected toggle(): void {
    void this.store.send({ command: this.store.state().status === 'running' ? 'pause' : 'start' });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.space', ['$event'])
  protected onSpace(event: Event): void {
    if ((event.target as HTMLElement | null)?.closest('button')) return;
    event.preventDefault();
    this.toggle();
  }
}
