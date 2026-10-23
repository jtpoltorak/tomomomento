/**
 * The live toolbar icon: a ring that empties as the timer runs, so the time
 * left shows at a glance without opening anything.
 */

const SIZES = [16, 32] as const;
const TRACK = 'rgba(134, 142, 150, 0.45)';

/** Draws the ring at one size: a faint full track, and the time left in color from twelve o'clock. */
export function drawRing(size: number, left: number, color: string): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const width = Math.max(2, Math.round(size * 0.2));
  const r = (size - width) / 2;
  const c = size / 2;
  ctx.lineWidth = width;
  ctx.strokeStyle = TRACK;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, 2 * Math.PI);
  ctx.stroke();
  const fraction = Math.min(Math.max(left, 0), 1);
  if (fraction > 0) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(c, c, r, -Math.PI / 2, -Math.PI / 2 + fraction * 2 * Math.PI);
    ctx.stroke();
  }
  // A small dot in the middle keeps it reading as a timer, not a loading spinner.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.14, 0, 2 * Math.PI);
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

// Starts true so a restarted worker puts the usual icon back once.
let showingRing = true;

export async function showRing(left: number, color: string): Promise<void> {
  const imageData = Object.fromEntries(SIZES.map((s) => [s, drawRing(s, left, color)]));
  await chrome.action.setIcon({ imageData });
  showingRing = true;
}

export async function showUsualIcon(): Promise<void> {
  if (!showingRing) return;
  await chrome.action.setIcon({
    path: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png' },
  });
  showingRing = false;
}
