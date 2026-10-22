import type { FocusSound } from './focus-sounds';
import type { AlertSound } from './sounds';
import type { Phase, TimerState } from './timer';

export type Command =
  /** `step`: the first tiny step for a focus session that's just beginning. */
  | { command: 'start'; step?: string }
  /** A short "Just start" focus session. */
  | { command: 'justStart' }
  /** A few more minutes of focus before the break ("Keep going"). */
  | { command: 'keepGoing' }
  /** End the settle-in breathing early and start the focus clock. */
  | { command: 'skipSettle' }
  /** Back from an "away" pause: the time away was focus, so count it. */
  | { command: 'wasWorking' }
  | { command: 'pause' }
  | { command: 'reset' }
  | { command: 'skip' }
  | { command: 'setPhase'; phase: Phase };

/** Popup -> background: change the timer. */
export type CommandMessage = { type: 'command' } & Command;

/** Background -> offscreen document: play an alert sound. */
export interface PlaySoundMessage {
  type: 'play-sound';
  target: 'offscreen';
  sound: AlertSound;
  volume: number;
}

/** Background -> offscreen document: start, adjust, or stop (null) the focus sound. */
export interface FocusSoundMessage {
  type: 'focus-sound';
  target: 'offscreen';
  sound: FocusSound | null;
  volume: number;
  /** When focus ends, so ticking can line up with the clock's seconds. */
  endTime: number | null;
}

export type CommandResponse = { ok: true; state: TimerState } | { ok: false; error: string };

export function sendCommand(command: Command): Promise<CommandResponse> {
  const message: CommandMessage = { type: 'command', ...command };
  return chrome.runtime.sendMessage(message);
}
