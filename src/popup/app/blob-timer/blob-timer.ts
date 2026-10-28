import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type { BlobSpeedId, BlobStyleId } from '../../../shared/timer';

const NS = 'http://www.w3.org/2000/svg';
/** Never more dots than this; longer sessions give each dot a few minutes. */
const MAX_DOTS = 64;
/** How much faster each speed moves than Gentle. */
export const BLOB_SPEEDS: Record<BlobSpeedId, number> = {
  gentle: 1,
  lively: 2,
  brisk: 3.5,
  speedy: 5,
};
/** At Gentle, one bridge forms and one lets go this often. */
const SHUFFLE_MS = 1800;
/** About 30 frames a second, which looks smooth for slow blobs and goes easy on batteries. */
const FRAME_MS = 33;
/** Mosaic colors, from the current color theme, so they follow themes and color-safe colors. */
const MOSAIC_CLASSES = ['k0', 'k1', 'k2'];

let nextId = 0;

/**
 * The blob timer: soft blobs that slowly join and part in place of the
 * digits, drawn with a "gooey" SVG filter (blur the shapes, then snap the
 * blur back to a hard edge, so shapes that come close grow a curved neck).
 *
 * - Dots: one dot per minute, filling in with the phase color as minutes pass.
 * - Mosaic: the same, with finished minutes in the three phase colors; matching neighbors melt together.
 * - Drift: blobs float around and get pulled into the middle one at a time.
 *
 * Decoration only: the clock around it carries the time for screen readers.
 * When still (reduced motion), the shapes hold and only the fill changes.
 */
@Component({
  selector: 'app-blob-timer',
  host: { 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 300 300" focusable="false">
      <defs>
        <filter
          [attr.id]="filterId"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          color-interpolation-filters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
          />
        </filter>
      </defs>
      <g #layer></g>
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 2.1em;
      height: 2.1em;
      overflow: visible;
    }
    /* Each group is one color; its dots and bridges take it through currentColor. */
    :host ::ng-deep .blob-group {
      fill: currentColor;
      stroke: currentColor;
      transition: color 0.3s;
    }
    :host ::ng-deep .fill,
    :host ::ng-deep .empty {
      color: var(--accent);
    }
    :host ::ng-deep .k0 {
      color: var(--focus-accent);
    }
    :host ::ng-deep .empty {
      opacity: 0.17;
    }
    :host ::ng-deep .k1 {
      color: var(--short-accent);
    }
    :host ::ng-deep .k2 {
      color: var(--long-accent);
    }
    /* High contrast: plain, crisp dots, with the minutes left easier to see. */
    :host-context([data-contrast='high']) ::ng-deep .blob-group {
      filter: none;
    }
    :host-context([data-contrast='high']) ::ng-deep line {
      display: none;
    }
    :host-context([data-contrast='high']) ::ng-deep .empty {
      opacity: 0.35;
    }
    @media (forced-colors: active) {
      :host ::ng-deep .blob-group {
        forced-color-adjust: none;
        color: Highlight;
      }
      :host ::ng-deep .empty {
        color: CanvasText;
        opacity: 0.4;
      }
    }
  `,
})
export class BlobTimer {
  /** How much of the phase is done, from 0 to 1. */
  readonly progress = input.required<number>();
  /** The phase's length in minutes, which sets how many dots there are. */
  readonly minutes = input.required<number>();
  readonly blobStyle = input<BlobStyleId>('dots');
  readonly speed = input<BlobSpeedId>('gentle');
  /** Hold the shapes still (reduced motion). */
  readonly still = input(false);

  protected readonly filterId = `blob-goo-${nextId++}`;
  private readonly layer = viewChild.required<ElementRef<SVGGElement>>('layer');
  private scene: Scene | null = null;
  private sceneKey = '';
  private frame = 0;
  private lastDraw = 0;
  private lastTick = 0;
  /** Time as the blobs feel it: real time, sped up by the speed setting. */
  private paced = 0;

  constructor() {
    const ready = { done: false };
    afterNextRender(() => {
      ready.done = true;
      this.update();
    });
    effect(() => {
      // Read every input, so a change redraws (and rebuilds when the layout changes).
      this.progress();
      this.minutes();
      this.blobStyle();
      this.speed();
      this.still();
      if (ready.done) this.update();
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  private update(): void {
    const key = `${this.blobStyle()}:${dotCount(this.minutes())}`;
    if (!this.scene || key !== this.sceneKey) {
      this.sceneKey = key;
      const g = this.layer().nativeElement;
      this.scene =
        this.blobStyle() === 'drift'
          ? new DriftScene(g, this.filterId)
          : new GridScene(
              g,
              this.filterId,
              dotCount(this.minutes()),
              this.blobStyle() === 'mosaic',
            );
    }
    const now = performance.now();
    if (this.still()) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.scene.draw(this.progress(), 0, this.paced, true);
    } else if (!this.frame) {
      this.lastTick = now;
      this.frame = requestAnimationFrame((t) => this.loop(t));
    }
  }

  private loop(now: number): void {
    this.frame = requestAnimationFrame((t) => this.loop(t));
    if (now - this.lastDraw < FRAME_MS) return;
    const pace = BLOB_SPEEDS[this.speed()];
    const dt = Math.min(now - this.lastTick, 200) * pace;
    this.lastTick = now;
    this.lastDraw = now;
    this.paced += dt;
    this.scene?.draw(this.progress(), dt, this.paced, false);
  }
}

/** How many dots to draw for a phase this long: one a minute, up to MAX_DOTS. */
export function dotCount(minutes: number): number {
  const m = Math.max(1, Math.round(minutes) || 1);
  return Math.ceil(m / Math.ceil(m / MAX_DOTS));
}

/** Columns and rows for n dots, as close to square as it gets. */
export function gridSize(n: number): { cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

/** How many of n dots are filled at this much progress. */
export function filledDots(progress: number, n: number): number {
  return Math.max(0, Math.min(n, Math.floor(progress * n + 1e-9)));
}

/** A small seeded random, so a pattern comes back the same when the popup reopens. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

interface Scene {
  /** dt and t are in "paced" milliseconds: real time sped up by the speed setting. */
  draw(progress: number, dt: number, t: number, still: boolean): void;
}

interface Dot {
  i: number;
  node: SVGCircleElement;
  color: number;
}

interface Bridge {
  a: Dot;
  b: Dot;
  node: SVGLineElement;
  w: number;
  target: number;
}

/** Dots and Mosaic: a grid of minute dots, with bridges that slowly form and let go. */
class GridScene implements Scene {
  private readonly dots: Dot[] = [];
  private readonly bridges: Bridge[] = [];
  private readonly groups = new Map<string, SVGGElement>();
  private readonly r: number;
  private readonly rand = seeded(7);
  private sinceShuffle = 0;

  constructor(
    layer: SVGGElement,
    filterId: string,
    private readonly n: number,
    private readonly mosaic: boolean,
  ) {
    const { cols, rows } = gridSize(n);
    const step = 270 / Math.max(cols, rows);
    this.r = step * 0.37;
    const ox = 150 - ((cols - 1) * step) / 2;
    const oy = 150 - ((rows - 1) * step) / 2;
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const row = Math.floor(i / cols);
      // Colors come in clumps (mostly copying a neighbor), so matching dots can melt together.
      const left = c > 0 ? this.dots[i - 1].color : null;
      const up = row > 0 ? this.dots[i - cols].color : null;
      const roll = this.rand();
      const color =
        left !== null && roll < 0.4
          ? left
          : up !== null && roll < 0.7
            ? up
            : Math.floor(this.rand() * MOSAIC_CLASSES.length);
      const node = svgEl('circle', { cx: ox + c * step, cy: oy + row * step, r: this.r });
      this.dots.push({ i, node, color });
    }
    for (const d of this.dots) {
      const c = d.i % cols;
      const neighbors = [c + 1 < cols ? this.dots[d.i + 1] : undefined, this.dots[d.i + cols]];
      for (const o of neighbors) {
        if (!o) continue;
        const on = this.rand() < 0.4 ? 1 : 0;
        const node = svgEl('line', {
          x1: d.node.getAttribute('cx')!,
          y1: d.node.getAttribute('cy')!,
          x2: o.node.getAttribute('cx')!,
          y2: o.node.getAttribute('cy')!,
          'stroke-linecap': 'round',
        });
        this.bridges.push({ a: d, b: o, node, w: on, target: on });
      }
    }
    // One gooey group per color, so colors never smear into each other.
    layer.replaceChildren();
    for (const key of ['empty', 'fill', ...MOSAIC_CLASSES]) {
      const g = svgEl('g', { class: `blob-group ${key}`, filter: `url(#${filterId})` });
      layer.appendChild(g);
      this.groups.set(key, g);
    }
  }

  draw(progress: number, dt: number, _t: number, still: boolean): void {
    const done = filledDots(progress, this.n);
    const keyOf = (d: Dot) =>
      d.i >= done ? 'empty' : this.mosaic ? MOSAIC_CLASSES[d.color] : 'fill';

    if (!still) {
      // Every so often, one bridge forms and one lets go; widths ease toward their targets.
      this.sinceShuffle += dt;
      if (this.sinceShuffle >= SHUFFLE_MS) {
        this.sinceShuffle = 0;
        const on = this.bridges.filter((b) => b.target === 1);
        const off = this.bridges.filter((b) => b.target === 0);
        if (on.length) on[Math.floor(this.rand() * on.length)].target = 0;
        if (off.length) off[Math.floor(this.rand() * off.length)].target = 1;
      }
      const ease = 1 - Math.exp(-dt * 0.00108);
      for (const b of this.bridges) b.w += (b.target - b.w) * ease;
    }

    for (const d of this.dots) {
      const g = this.groups.get(keyOf(d))!;
      if (d.node.parentNode !== g) g.appendChild(d.node);
    }
    for (const b of this.bridges) {
      const key = keyOf(b.a);
      if (key !== keyOf(b.b) || b.w < 0.02) {
        b.node.remove();
        continue;
      }
      const g = this.groups.get(key)!;
      if (b.node.parentNode !== g) g.insertBefore(b.node, g.firstChild);
      // A thick enough line between two dots turns into a curved neck under the filter.
      b.node.setAttribute('stroke-width', (b.w * this.r * 1.25).toFixed(2));
    }
  }
}

interface Drifter {
  node: SVGCircleElement;
  angle: number;
  dist: number;
  spin: number;
  r: number;
  phase: number;
}

/** Drift: blobs orbit slowly and get pulled into the middle one at a time, ending as one blob. */
class DriftScene implements Scene {
  private readonly blobs: Drifter[] = [];
  private readonly core: SVGCircleElement;

  constructor(layer: SVGGElement, filterId: string) {
    const rand = seeded(7);
    const count = 8;
    layer.replaceChildren();
    const g = svgEl('g', { class: 'blob-group fill', filter: `url(#${filterId})` });
    layer.appendChild(g);
    this.core = svgEl('circle', { cx: 150, cy: 150, r: 26 });
    g.appendChild(this.core);
    for (let i = 0; i < count; i++) {
      const node = svgEl('circle');
      g.appendChild(node);
      this.blobs.push({
        node,
        angle: (i / count) * Math.PI * 2 + rand() * 0.5,
        dist: 85 + rand() * 30,
        spin: (0.12 + rand() * 0.1) * (rand() < 0.5 ? -1 : 1),
        r: 15 + rand() * 9,
        phase: rand() * 6.28,
      });
    }
  }

  draw(progress: number, _dt: number, t: number): void {
    const s = t / 1000;
    const n = this.blobs.length;
    let absorbed = 0;
    this.blobs.forEach((b, i) => {
      const x = Math.min(1, Math.max(0, progress * n - i));
      const pull = x * x * (3 - 2 * x);
      absorbed += pull;
      const angle = b.angle + s * b.spin;
      const dist = (b.dist + Math.sin(s * 0.6 + b.phase) * 8) * (1 - pull);
      const r = b.r * (1 - pull * 0.85) + Math.sin(s * 0.9 + b.phase) * 1.5;
      b.node.setAttribute('cx', (150 + Math.cos(angle) * dist).toFixed(2));
      b.node.setAttribute('cy', (150 + Math.sin(angle) * dist).toFixed(2));
      b.node.setAttribute('r', Math.max(0, r).toFixed(2));
    });
    this.core.setAttribute('r', (26 + absorbed * 9 + Math.sin(s * 0.7) * 2).toFixed(2));
  }
}
