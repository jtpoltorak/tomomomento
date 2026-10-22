import {
  clearThoughts,
  EMPTY_PARKING_LOT,
  markSeen,
  markWrapped,
  MAX_THOUGHT_LENGTH,
  MAX_THOUGHTS,
  parkThought,
  removeThought,
  sanitizeParkingLot,
  thoughtsText,
  unseenCount,
  wrapUpDue,
} from './parking';

describe('parking lot', () => {
  it('parks trimmed thoughts in order and ignores blank ones', () => {
    let lot = parkThought(EMPTY_PARKING_LOT, '  call   the dentist ', 100, 'a');
    lot = parkThought(lot, '   ', 200, 'b');
    lot = parkThought(lot, 'buy milk', 300, 'c');
    expect(lot.thoughts).toEqual([
      { id: 'a', text: 'call the dentist', at: 100 },
      { id: 'c', text: 'buy milk', at: 300 },
    ]);
  });

  it('caps the length of a thought and the size of the lot', () => {
    let lot = parkThought(EMPTY_PARKING_LOT, 'x'.repeat(500), 1, 'long');
    expect(lot.thoughts[0].text.length).toBe(MAX_THOUGHT_LENGTH);
    for (let i = 0; i < MAX_THOUGHTS; i++) lot = parkThought(lot, `t${i}`, 2 + i, `id${i}`);
    expect(lot.thoughts.length).toBe(MAX_THOUGHTS);
    expect(lot.thoughts[0].id).toBe('id0'); // the oldest one made room
  });

  it('removes one thought or all of them', () => {
    let lot = parkThought(EMPTY_PARKING_LOT, 'a', 1, 'a');
    lot = parkThought(lot, 'b', 2, 'b');
    expect(removeThought(lot, 'a').thoughts.map((t) => t.id)).toEqual(['b']);
    expect(clearThoughts(lot).thoughts).toEqual([]);
  });

  it('counts only thoughts parked since the lot was last seen', () => {
    let lot = parkThought(EMPTY_PARKING_LOT, 'a', 100, 'a');
    lot = markSeen(lot, 150);
    expect(unseenCount(lot)).toBe(0);
    lot = parkThought(lot, 'b', 200, 'b');
    lot = parkThought(lot, 'c', 300, 'c');
    expect(unseenCount(lot)).toBe(2);
  });

  it('drops malformed stored data', () => {
    expect(sanitizeParkingLot(undefined)).toEqual(EMPTY_PARKING_LOT);
    expect(sanitizeParkingLot('nope')).toEqual(EMPTY_PARKING_LOT);
    expect(
      sanitizeParkingLot({
        thoughts: [
          { id: 'a', text: ' ok ', at: 5 },
          { id: 'a', text: 'duplicate id', at: 6 },
          { id: 'b', text: '', at: 7 },
          { text: 'no id' },
          null,
          { id: 'c', text: 'no time' },
        ],
        seenAt: 'later',
      }),
    ).toEqual({
      thoughts: [
        { id: 'a', text: 'ok', at: 5 },
        { id: 'c', text: 'no time', at: 0 },
      ],
      seenAt: 0,
    });
  });

  it('says "thought" or "thoughts"', () => {
    expect(thoughtsText(1)).toBe('1 thought');
    expect(thoughtsText(3)).toBe('3 thoughts');
  });

  describe('day wrap-up', () => {
    const at = (hour: number) => new Date(2026, 9, 22, hour).getTime();
    const lot = parkThought(EMPTY_PARKING_LOT, 'call the dentist', 1, 'a');

    it('is due in the evening while thoughts are parked, once a day', () => {
      expect(wrapUpDue(lot, '2026-10-22', at(16))).toBe(false);
      expect(wrapUpDue(lot, '2026-10-22', at(17))).toBe(true);
      expect(wrapUpDue(EMPTY_PARKING_LOT, '2026-10-22', at(20))).toBe(false);
      const wrapped = markWrapped(lot, '2026-10-22');
      expect(wrapUpDue(wrapped, '2026-10-22', at(20))).toBe(false);
      expect(wrapUpDue(wrapped, '2026-10-23', at(20))).toBe(true);
    });

    it('keeps a valid wrap-up day from storage and drops a bad one', () => {
      expect(sanitizeParkingLot({ ...lot, wrappedOn: '2026-10-22' }).wrappedOn).toBe('2026-10-22');
      expect('wrappedOn' in sanitizeParkingLot({ ...lot, wrappedOn: 'tonight' })).toBe(false);
    });
  });
});
