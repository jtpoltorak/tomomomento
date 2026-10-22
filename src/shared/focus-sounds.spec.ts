import { brownBuffer, nextTickAt, rainBuffer, tickBuffer, wavesBuffer } from './focus-sounds';

/** Just enough of an AudioContext to build buffers in Node. */
function fakeContext(sampleRate = 8000): BaseAudioContext {
  return {
    sampleRate,
    createBuffer: (channels: number, length: number, rate: number) => {
      const data = new Float32Array(length);
      return { length, sampleRate: rate, numberOfChannels: channels, getChannelData: () => data };
    },
  } as unknown as BaseAudioContext;
}

describe('focus sounds', () => {
  it('ticks as the clock’s seconds change', () => {
    // 24:30.250 left: the clock shows 24:31 until 250 ms from now.
    const now = 1_000_000;
    const endTime = now + 24 * 60_000 + 30_250;
    expect(nextTickAt(endTime, now)).toBe(now + 250);
    expect(nextTickAt(endTime, now + 250)).toBe(now + 250);
    expect(nextTickAt(endTime, now + 251)).toBe(now + 1250);
  });

  it('builds a tick and a tock a second apart', () => {
    const buffer = tickBuffer(fakeContext());
    const data = buffer.getChannelData(0);
    expect(buffer.length).toBe(16_000);
    const loud = (from: number, to: number) =>
      Math.max(...Array.from(data.subarray(from, to), Math.abs));
    expect(loud(0, 400)).toBeGreaterThan(0.3);
    expect(loud(8000, 8400)).toBeGreaterThan(0.3);
    expect(loud(1000, 7900)).toBe(0);
  });

  it('loops brown noise without a click at the seam', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const data = brownBuffer(fakeContext(), random).getChannelData(0);
    expect(Math.max(...Array.from(data, Math.abs))).toBeCloseTo(0.9, 5);
    expect(Math.abs(data[data.length - 1] - data[0])).toBeLessThan(1e-6);
  });

  describe('rain and ocean waves', () => {
    function seeded() {
      let seed = 7;
      return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    }
    /** The biggest jump between neighboring samples, and the jump across the loop's seam. */
    function jumps(data: Float32Array) {
      let biggest = 0;
      for (let i = 1; i < data.length; i++) {
        biggest = Math.max(biggest, Math.abs(data[i] - data[i - 1]));
      }
      return { biggest, seam: Math.abs(data[0] - data[data.length - 1]) };
    }
    function rms(data: Float32Array, from: number, to: number) {
      let sum = 0;
      for (let i = from; i < to; i++) sum += data[i] ** 2;
      return Math.sqrt(sum / (to - from));
    }

    it('loops rain without a click at the seam', () => {
      const data = rainBuffer(fakeContext(), seeded()).getChannelData(0);
      expect(data.length).toBe(80_000);
      expect(Math.max(...Array.from(data, Math.abs))).toBeCloseTo(0.9, 5);
      const { biggest, seam } = jumps(data);
      expect(seam).toBeLessThan(biggest / 2);
    });

    it('swells and washes out twice per loop, without a click at the seam', () => {
      const data = wavesBuffer(fakeContext(), seeded()).getChannelData(0);
      expect(data.length).toBe(128_000);
      // Each 8-second wave peaks around 3 seconds in and is quietest as the next one begins.
      for (const start of [0, 64_000]) {
        expect(rms(data, start + 22_000, start + 26_000)).toBeGreaterThan(
          2 * rms(data, start + 60_000, start + 64_000),
        );
      }
      const { biggest, seam } = jumps(data);
      expect(seam).toBeLessThan(biggest / 2);
    });
  });
});
