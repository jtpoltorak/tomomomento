import { Component, input } from '@angular/core';

/** What the buddy is up to: typing while you focus, napping on breaks, waiting otherwise. */
export type BuddyMode = 'work' | 'rest' | 'idle';

/**
 * The focus buddy: a little cat that works alongside you ("body doubling").
 * It types at its laptop while focus runs, naps on breaks, and sits and
 * blinks while the timer waits. Decoration only, so it's hidden from screen readers.
 */
@Component({
  selector: 'app-focus-buddy',
  host: { '[attr.data-mode]': 'mode()', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 64 64" focusable="false">
      <!-- Tail, body and head. -->
      <path class="tail" d="M44 52c8 0 12-4 11-10" />
      <ellipse class="fur" cx="32" cy="46" rx="14" ry="11" />
      <path class="fur" d="M19 24l2-11 8 7h6l8-7 2 11z" />
      <circle class="fur" cx="32" cy="28" r="12" />
      <path class="ear" d="M22.5 19l1-4.5 3.5 3M41.5 19l-1-4.5-3.5 3" />
      @if (mode() === 'rest') {
        <path class="line" d="M25 29q2.5 2 5 0M34 29q2.5 2 5 0" />
        <text class="z" x="44" y="14">z</text>
        <text class="z z2" x="50" y="8">z</text>
      } @else {
        <g class="eyes">
          <circle class="eye" cx="27.5" cy="28" r="1.8" />
          <circle class="eye" cx="36.5" cy="28" r="1.8" />
        </g>
      }
      <path class="line" d="M30.5 32.5h3l-1.5 1.5zM32 34v1.5" />
      @if (mode() === 'work') {
        <!-- A little laptop, with paws taking turns on the keys. -->
        <path class="laptop" d="M18 50h28l-3 6H21z" />
        <rect class="screen" x="21" y="41" width="22" height="9" rx="1.5" />
        <ellipse class="paw left" cx="26" cy="51" rx="3" ry="2" />
        <ellipse class="paw right" cx="38" cy="51" rx="3" ry="2" />
      } @else {
        <ellipse class="paw" cx="27" cy="55" rx="3.2" ry="2.2" />
        <ellipse class="paw" cx="37" cy="55" rx="3.2" ry="2.2" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      width: 3.5rem;
      height: 3.5rem;
      color: var(--fg);
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .fur,
    .paw {
      fill: var(--surface);
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linejoin: round;
    }
    .tail,
    .line,
    .ear {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .eye {
      fill: currentColor;
    }
    .laptop {
      fill: var(--muted);
    }
    .screen {
      fill: color-mix(in srgb, var(--accent) 35%, var(--bg));
      stroke: var(--muted);
      stroke-width: 1.5;
    }
    .z {
      fill: var(--muted);
      font-size: 8px;
      font-weight: 600;
      animation: drift 3s ease-in-out infinite;
    }
    .z2 {
      font-size: 6px;
      animation-delay: 1.5s;
    }
    /* Blink every few seconds while waiting or working. */
    .eyes {
      transform-origin: 32px 28px;
      animation: blink 4.5s infinite;
    }
    .paw.left {
      animation: tap 0.6s ease-in-out infinite;
    }
    .paw.right {
      animation: tap 0.6s ease-in-out infinite 0.3s;
    }
    .tail {
      transform-origin: 44px 52px;
      animation: swish 3s ease-in-out infinite;
    }
    :host([data-mode='rest']) .tail {
      animation: none;
    }
    /* Napping: the whole cat breathes slowly. */
    :host([data-mode='rest']) svg {
      transform-origin: 50% 100%;
      animation: snooze 4s ease-in-out infinite;
    }
    @keyframes blink {
      0%,
      94%,
      100% {
        transform: scaleY(1);
      }
      97% {
        transform: scaleY(0.1);
      }
    }
    @keyframes tap {
      0%,
      100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-1.5px);
      }
    }
    @keyframes swish {
      0%,
      100% {
        transform: rotate(0deg);
      }
      50% {
        transform: rotate(-12deg);
      }
    }
    @keyframes snooze {
      0%,
      100% {
        transform: scaleY(1);
      }
      50% {
        transform: scaleY(0.97);
      }
    }
    @keyframes drift {
      0%,
      100% {
        opacity: 0.3;
        transform: translateY(1px);
      }
      50% {
        opacity: 1;
        transform: translateY(-1px);
      }
    }
    @media (forced-colors: active) {
      .fur,
      .paw {
        fill: Canvas;
      }
      .laptop,
      .screen,
      .z {
        fill: CanvasText;
      }
    }
  `,
})
export class FocusBuddy {
  readonly mode = input<BuddyMode>('idle');
}
