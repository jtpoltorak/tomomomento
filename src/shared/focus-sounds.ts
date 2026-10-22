// Background sounds for focus sessions, synthesized with the Web Audio API like
// the alert sounds. Each is a short buffer that loops, so nothing depends on
// timers that a hidden page might throttle. Used by the offscreen document (the
// extension), the web app's host, and the settings preview.

import type { FocusSoundId } from './timer';

export type FocusSound = Exclude<FocusSoundId, 'off'>;

/** How loud each sound is at full volume. Both sit well under the alert sounds. */
const LOUDNESS: Record<FocusSound, number> = { tick: 0.5, brown: 0.6, rain: 0.5, waves: 0.6 };
const FADE_IN = 1;
const FADE_OUT = 0.4;

/** Two seconds of a soft wooden "tick… tock", one beat per second. */
export function tickBuffer(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, rate * 2, rate);
  const data = buffer.getChannelData(0);
  // The tock is a little lower, like a clock's escapement.
  for (const [start, freq] of [
    [0, 1500],
    [1, 1250],
  ] as const) {
    const offset = start * rate;
    const length = Math.round(0.03 * rate);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      data[offset + i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / 0.006);
    }
  }
  return buffer;
}

/**
 * Brown noise: white noise, integrated, so the energy sits in the low end like
 * a distant waterfall. The drift is taken out so the loop's ends meet without
 * a click.
 */
export function brownBuffer(ctx: BaseAudioContext, random = Math.random): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = rate * 8;
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    // A leaky integrator keeps it from wandering off.
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    data[i] = last;
  }
  const drift = data[length - 1] - data[0];
  let peak = 0;
  for (let i = 0; i < length; i++) {
    data[i] -= (drift * i) / (length - 1);
    peak = Math.max(peak, Math.abs(data[i]));
  }
  for (let i = 0; i < length; i++) data[i] = (data[i] / (peak || 1)) * 0.9;
  return buffer;
}

/**
 * Makes a loop seamless: `make` fills `length + fade` samples, and the extra
 * tail fades into the start (equal power, so the level doesn't dip), so the
 * last sample flows into the first like any two neighbors.
 */
function seamless(
  ctx: BaseAudioContext,
  seconds: number,
  make: (data: Float32Array, rate: number) => void,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.round(rate * seconds);
  const fade = Math.round(rate * 0.25);
  const raw = new Float32Array(length + fade);
  make(raw, rate);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const t = i < fade ? i / fade : 1;
    data[i] = i < fade ? raw[i] * Math.sqrt(t) + raw[length + i] * Math.sqrt(1 - t) : raw[i];
    peak = Math.max(peak, Math.abs(data[i]));
  }
  for (let i = 0; i < length; i++) data[i] = (data[i] / (peak || 1)) * 0.9;
  return buffer;
}

/** Steady rain: a soft hiss with drops pattering through it. */
export function rainBuffer(ctx: BaseAudioContext, random = Math.random): AudioBuffer {
  return seamless(ctx, 10, (data, rate) => {
    // The hiss: white noise, softened, with the rumble taken out.
    let soft = 0;
    let rumble = 0;
    for (let i = 0; i < data.length; i++) {
      soft += 0.35 * (random() * 2 - 1 - soft);
      rumble += 0.01 * (soft - rumble);
      data[i] = 0.35 * (soft - rumble);
    }
    // About 30 drops a second, each a tiny burst that dies away in a few milliseconds.
    const drops = Math.round((data.length / rate) * 30);
    for (let d = 0; d < drops; d++) {
      const at = Math.floor(random() * data.length);
      const level = 0.1 + 0.5 * random() ** 2;
      const decay = (0.002 + 0.008 * random()) * rate;
      for (let i = 0; i < decay * 5 && at + i < data.length; i++) {
        data[at + i] += level * (random() * 2 - 1) * Math.exp(-i / decay);
      }
    }
  });
}

/** Ocean waves: two slow swells that rise, break into foam, and wash back out. */
export function wavesBuffer(ctx: BaseAudioContext, random = Math.random): AudioBuffer {
  const period = 8;
  return seamless(ctx, period * 2, (data, rate) => {
    let deep = 0;
    let foam = 0;
    for (let i = 0; i < data.length; i++) {
      const phase = ((i / rate) % period) / period;
      // Rises over the first 40% of each wave, then washes out.
      const swell =
        phase < 0.4
          ? 0.5 - 0.5 * Math.cos((Math.PI * phase) / 0.4)
          : 0.5 + 0.5 * Math.cos((Math.PI * (phase - 0.4)) / 0.6);
      const white = random() * 2 - 1;
      deep = (deep + 0.02 * white) / 1.02;
      foam += 0.3 * (white - foam);
      data[i] = (0.25 + 0.75 * swell) * (6 * deep + 0.5 * foam * swell * swell);
    }
  });
}

/**
 * When to start the ticking loop so each tick lands as the clock's seconds
 * change. Returns the wall-clock time of the next whole second before `endTime`,
 * at or after `now`.
 */
export function nextTickAt(endTime: number, now: number): number {
  const msIntoSecond = (((endTime - now) % 1000) + 1000) % 1000;
  return now + msIntoSecond;
}

const BUILDERS: Record<FocusSound, (ctx: BaseAudioContext) => AudioBuffer> = {
  tick: tickBuffer,
  brown: (ctx) => brownBuffer(ctx),
  rain: (ctx) => rainBuffer(ctx),
  waves: (ctx) => wavesBuffer(ctx),
};

/** Plays one focus sound at a time, looping until stopped. */
export class FocusSoundPlayer {
  private current:
    | { sound: FocusSound; source: AudioBufferSourceNode; gain: GainNode; endTime: number | null }
    | undefined;
  private readonly buffers = new Map<FocusSound, AudioBuffer>();

  constructor(private readonly ctx: AudioContext) {}

  /**
   * Starts or adjusts the sound. Ticking lines up with `endTime` when it's
   * given, so the ticks fall with the clock's seconds.
   */
  play(sound: FocusSound, volume: number, endTime: number | null = null): void {
    const level = Math.max(0, Math.min(1, volume)) * LOUDNESS[sound];
    const now = this.ctx.currentTime;
    const current = this.current;
    if (current && current.sound === sound && current.endTime === endTime) {
      current.gain.gain.cancelScheduledValues(now);
      current.gain.gain.setValueAtTime(current.gain.gain.value, now);
      current.gain.gain.linearRampToValueAtTime(level, now + 0.2);
      return;
    }
    this.stop();
    let buffer = this.buffers.get(sound);
    if (!buffer) {
      buffer = BUILDERS[sound](this.ctx);
      this.buffers.set(sound, buffer);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + FADE_IN);
    source.connect(gain).connect(this.ctx.destination);
    let startAt = now + 0.05;
    if (sound === 'tick' && endTime !== null) {
      const wall = Date.now();
      startAt = now + (nextTickAt(endTime, wall + 50) - wall) / 1000;
    }
    source.start(startAt);
    this.current = { sound, source, gain, endTime };
  }

  /** Fades out whatever is playing. */
  stop(): void {
    const current = this.current;
    if (!current) return;
    this.current = undefined;
    const now = this.ctx.currentTime;
    current.gain.gain.cancelScheduledValues(now);
    current.gain.gain.setValueAtTime(current.gain.gain.value, now);
    current.gain.gain.linearRampToValueAtTime(0, now + FADE_OUT);
    current.source.stop(now + FADE_OUT + 0.05);
  }

  get playing(): FocusSound | null {
    return this.current?.sound ?? null;
  }
}
