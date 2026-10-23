import { Component, input } from '@angular/core';

/**
 * The breathing circle: during Settle in, a soft circle grows as you breathe
 * in (4 s) and shrinks as you breathe out (6 s). With reduced motion it holds
 * still and the words lead the way.
 */
@Component({
  selector: 'app-breath-circle',
  template: `<div class="circle" [style.animation-delay.ms]="delay()"></div>`,
  styles: `
    :host {
      display: grid;
      place-items: center;
      width: 6.5rem;
      height: 6.5rem;
    }
    .circle {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        color-mix(in srgb, var(--accent) 55%, transparent),
        color-mix(in srgb, var(--accent) 20%, transparent)
      );
      transform: scale(0.75);
      animation: breath 10s ease-in-out infinite;
    }
    @keyframes breath {
      0%,
      100% {
        transform: scale(0.45);
      }
      40% {
        transform: scale(1);
      }
    }
    @media (forced-colors: active) {
      .circle {
        forced-color-adjust: none;
        background: Highlight;
      }
    }
  `,
})
export class BreathCircle {
  /** Negative to start partway through a breath, when the popup opens mid-breath. */
  readonly delay = input(0);
}
