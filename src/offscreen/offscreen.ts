import { FocusSoundPlayer } from '../shared/focus-sounds';
import type { FocusSoundMessage, PlaySoundMessage } from '../shared/messages';
import { playSound } from '../shared/sounds';

const ctx = new AudioContext();
const focusSound = new FocusSoundPlayer(ctx);

chrome.runtime.onMessage.addListener(
  (message: PlaySoundMessage | FocusSoundMessage, _sender, sendResponse) => {
    if (message?.target !== 'offscreen') return false;
    if (message.type === 'play-sound') {
      void ctx
        .resume()
        .then(() => playSound(ctx, message.sound, message.volume))
        .finally(() => sendResponse(true));
      return true;
    }
    if (message.type === 'focus-sound') {
      void ctx
        .resume()
        .then(() => {
          if (message.sound) focusSound.play(message.sound, message.volume, message.endTime);
          else focusSound.stop();
        })
        .finally(() => sendResponse(true));
      return true;
    }
    return false;
  },
);
