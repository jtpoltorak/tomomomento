// Alert sounds are synthesized with the Web Audio API, so the extension ships
// no audio files. Used by the offscreen document (alerts while the popup is
// closed) and by the settings screen (preview).

import type { SoundId } from './timer';

/** One of the alert sounds people pick from, or the quiet heads-up before one. */
export type AlertSound = SoundId | 'headsUp';

interface Note {
  freq: number;
  /** Seconds after the sound starts. */
  at: number;
  duration: number;
  type: OscillatorType;
  /** Slides to this frequency over the note, for chirps. */
  to?: number;
}

const SOUNDS: Record<AlertSound, Note[]> = {
  // A single soft, low tone: a minute to go, nothing to do yet.
  headsUp: [{ freq: 587.33, at: 0, duration: 1.2, type: 'sine' }],
  // A soft bell: a fundamental plus a quieter overtone, with a long decay.
  bell: [
    { freq: 880, at: 0, duration: 1.6, type: 'sine' },
    { freq: 1760, at: 0, duration: 0.8, type: 'sine' },
    { freq: 880, at: 0.9, duration: 1.6, type: 'sine' },
  ],
  // A rising C-major arpeggio.
  chime: [
    { freq: 1046.5, at: 0, duration: 0.7, type: 'triangle' },
    { freq: 1318.5, at: 0.18, duration: 0.7, type: 'triangle' },
    { freq: 1568, at: 0.36, duration: 1.1, type: 'triangle' },
  ],
  // Three short alarm-clock beeps.
  digital: [0, 0.25, 0.5].map((at) => ({
    freq: 1000,
    at,
    duration: 0.14,
    type: 'square' as const,
  })),
  // A warm, wooden pentatonic phrase: short sines that die away fast.
  marimba: [
    { freq: 523.25, at: 0, duration: 0.45, type: 'sine' },
    { freq: 659.25, at: 0.16, duration: 0.45, type: 'sine' },
    { freq: 783.99, at: 0.32, duration: 0.45, type: 'sine' },
    { freq: 1046.5, at: 0.56, duration: 0.8, type: 'sine' },
  ],
  // Two little birds: quick upward chirps, then an answering trill.
  birdsong: [
    { freq: 2600, to: 3600, at: 0, duration: 0.12, type: 'sine' },
    { freq: 2600, to: 3600, at: 0.18, duration: 0.12, type: 'sine' },
    { freq: 3400, to: 2400, at: 0.5, duration: 0.18, type: 'sine' },
    { freq: 3000, to: 3800, at: 0.75, duration: 0.1, type: 'sine' },
    { freq: 3000, to: 3800, at: 0.88, duration: 0.1, type: 'sine' },
    { freq: 3000, to: 3800, at: 1.01, duration: 0.1, type: 'sine' },
  ],
  // A low gong: a deep tone and two out-of-tune partials, fading slowly.
  gong: [
    { freq: 130.81, at: 0, duration: 3.2, type: 'sine' },
    { freq: 278.4, at: 0, duration: 2.2, type: 'sine' },
    { freq: 431.7, at: 0, duration: 1.4, type: 'sine' },
  ],
};

/** Plays a sound and resolves when it has finished. */
export function playSound(ctx: AudioContext, sound: AlertSound, volume: number): Promise<void> {
  const notes = SOUNDS[sound];
  const start = ctx.currentTime + 0.05;
  // Square waves are much louder than sines at the same gain, and the heads-up stays quiet.
  // The gong's three partials ring together, so each gets less.
  const loudness: Partial<Record<AlertSound, number>> = {
    digital: 0.12,
    headsUp: 0.2,
    birdsong: 0.25,
    gong: 0.22,
  };
  const level = Math.max(0, Math.min(1, volume)) * (loudness[sound] ?? 0.35);

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.type;
    const t = start + note.at;
    osc.frequency.setValueAtTime(note.freq, t);
    if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, t + note.duration);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + note.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + note.duration + 0.05);
  }

  const end = Math.max(...notes.map((n) => n.at + n.duration));
  return new Promise((resolve) => setTimeout(resolve, (end + 0.1) * 1000));
}
