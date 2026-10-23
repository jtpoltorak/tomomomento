import { Component, computed, input } from '@angular/core';

/**
 * The visual timer: a colored disc that shrinks as time passes, like a kitchen
 * timer you can read from across the room. Sized in em, so it follows the clock's font size.
 */
@Component({
  selector: 'app-visual-timer',
  template: `
    <svg viewBox="-1 -1 2 2" aria-hidden="true" focusable="false">
      <circle class="track" r="1" />
      @if (left() >= 1) {
        <circle class="left" r="1" />
      } @else if (wedge(); as d) {
        <path class="left" [attr.d]="d" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 1.25em;
      height: 1.25em;
      overflow: visible; /* room for the forced-colors outline */
    }
    .track {
      fill: var(--track);
    }
    .left {
      fill: var(--accent);
      transition: fill 0.3s;
    }
    @media (forced-colors: active) {
      .track {
        fill: Canvas;
        stroke: CanvasText;
        stroke-width: 0.02;
      }
      .left {
        fill: Highlight;
      }
    }
  `,
})
export class VisualTimer {
  /** How much of the phase is left, from 1 (all of it) down to 0. */
  readonly left = input.required<number>();

  /** The time left as a wedge from twelve o'clock, shrinking back toward it as time runs out. */
  protected readonly wedge = computed(() => wedgePath(this.left()));
}

/** An SVG path for a wedge of a unit circle covering `fraction` of it, counterclockwise from the top. */
export function wedgePath(fraction: number): string | null {
  if (!(fraction > 0)) return null;
  const angle = Math.min(fraction, 1) * 2 * Math.PI;
  const x = -Math.sin(angle);
  const y = -Math.cos(angle);
  const large = fraction > 0.5 ? 1 : 0;
  return `M0 0L0 -1A1 1 0 ${large} 0 ${round(x)} ${round(y)}Z`;
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;
