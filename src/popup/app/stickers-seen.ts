// Which stickers have been seen, kept on this device only, so a new one gets a
// card on the timer once and then stays quiet.

const KEY = 'tomomomento.stickersSeen';

export function readSeenStickers(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function writeSeenStickers(ids: readonly string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: the card may show again next time, which is fine.
  }
}
