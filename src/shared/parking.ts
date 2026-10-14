// The parking lot: a place to drop a stray thought mid-focus so it stops
// tugging at you, and pick it back up on a break. Pure functions only, like
// plan.ts.
//
// Thoughts stay until you clear them. Cleared ones are gone for good, so
// nothing keeps a record of what you did or didn't get to.

export const MAX_THOUGHTS = 50;
export const MAX_THOUGHT_LENGTH = 120;

export interface Thought {
  id: string;
  text: string;
  /** Epoch ms when it was parked. */
  at: number;
}

export interface ParkingLot {
  /** Oldest first. */
  thoughts: Thought[];
  /** Epoch ms the lot was last opened or its break card waved off. */
  seenAt: number;
}

export const EMPTY_PARKING_LOT: ParkingLot = { thoughts: [], seenAt: 0 };

export function cleanThought(text: unknown): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_THOUGHT_LENGTH);
}

/** Drops anything malformed, since storage can hold whatever an older version wrote. */
export function sanitizeParkingLot(input: unknown): ParkingLot {
  if (!input || typeof input !== 'object') return EMPTY_PARKING_LOT;
  const raw = input as Partial<Record<keyof ParkingLot, unknown>>;
  const thoughts: Thought[] = [];
  const ids = new Set<string>();
  for (const t of Array.isArray(raw.thoughts) ? raw.thoughts : []) {
    if (!t || typeof t !== 'object') continue;
    const { id, text, at } = t as Partial<Record<keyof Thought, unknown>>;
    const clean = cleanThought(text);
    if (typeof id !== 'string' || !id || ids.has(id) || !clean) continue;
    ids.add(id);
    thoughts.push({ id, text: clean, at: Number.isFinite(at) ? Number(at) : 0 });
  }
  const seenAt = Number(raw.seenAt);
  return {
    thoughts: thoughts.slice(-MAX_THOUGHTS),
    seenAt: Number.isFinite(seenAt) ? seenAt : 0,
  };
}

/** Adds a thought at the end. Blank text changes nothing; past the limit, the oldest goes. */
export function parkThought(lot: ParkingLot, text: string, now: number, id: string): ParkingLot {
  const clean = cleanThought(text);
  if (!clean) return lot;
  const thoughts = [...lot.thoughts, { id, text: clean, at: now }];
  return { ...lot, thoughts: thoughts.slice(-MAX_THOUGHTS) };
}

export function removeThought(lot: ParkingLot, id: string): ParkingLot {
  return { ...lot, thoughts: lot.thoughts.filter((t) => t.id !== id) };
}

export function clearThoughts(lot: ParkingLot): ParkingLot {
  return { ...lot, thoughts: [] };
}

export function markSeen(lot: ParkingLot, now: number): ParkingLot {
  return { ...lot, seenAt: now };
}

/** Thoughts parked since you last looked, which the break card points you to. */
export function unseenCount(lot: ParkingLot): number {
  return lot.thoughts.filter((t) => t.at > lot.seenAt).length;
}

export function thoughtsText(n: number): string {
  return n === 1 ? '1 thought' : `${n} thoughts`;
}
