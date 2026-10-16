// Background sounds for focus sessions, synthesized with the Web Audio API like
// the alert sounds. Each is a short buffer that loops, so nothing depends on
// timers that a hidden page might throttle. Used by the offscreen document (the
// extension), the web app's host, and the settings preview.

import type { FocusSoundId } from './timer';

export type FocusSound = Exclude<FocusSoundId, 'off'>;

/** How loud each sound is at full volume. Both sit well under the alert sounds. */
const LOUDNESS: Record<FocusSound, number> = { tick: 0.5, brown: 0.6 };
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
 * When to start the ticking loop so each tick lands as the clock's seconds
 * change. Returns the wall-clock time of the next whole second before `endTime`,
 * at or after `now`.
 */
export function nextTickAt(endTime: number, now: number): number {
  const msIntoSecond = (((endTime - now) % 1000) + 1000) % 1000;
  return now + msIntoSecond;
}

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
      buffer = sound === 'tick' ? tickBuffer(this.ctx) : brownBuffer(this.ctx);
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
