import type { AlertSound } from './sounds';
import type { Phase, TimerState } from './timer';

export type Command =
  | { command: 'start' }
  /** A short "Just start" focus session. */
  | { command: 'justStart' }
  /** A few more minutes of focus before the break ("Keep going"). */
  | { command: 'keepGoing' }
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

export type CommandResponse = { ok: true; state: TimerState } | { ok: false; error: string };

export function sendCommand(command: Command): Promise<CommandResponse> {
  const message: CommandMessage = { type: 'command', ...command };
  return chrome.runtime.sendMessage(message);
}
