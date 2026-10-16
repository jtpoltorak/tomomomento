import { FocusSoundPlayer } from '../shared/focus-sounds';
import { DEFAULT_SETTINGS } from '../shared/timer';
import { WebTimerHost } from './web-timer-host';

describe('WebTimerHost', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('starts from the classic defaults', async () => {
    const { state, settings, blockerAccess } = await new WebTimerHost().load();
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(state).toMatchObject({ phase: 'work', status: 'idle', remainingMs: 25 * 60_000 });
    expect(blockerAccess).toBe(false);
  });

  it('runs a focus session to its end and moves on to a break', async () => {
    const host = new WebTimerHost();
    const changes = vi.fn();
    host.onChange(changes);

    const res = await host.send({ command: 'start' });
    expect(res.ok && res.state.status).toBe('running');
    expect(document.title).toBe('25:00 Focus · Tomomomento');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(document.title).toBe('24:00 Focus · Tomomomento');

    await vi.advanceTimersByTimeAsync(24 * 60_000 + 100);
    const { state } = await host.load();
    expect(state).toMatchObject({ phase: 'shortBreak', status: 'idle', completedToday: 1 });
    expect(document.title).toBe('✓ Time for your short break · Tomomomento');
    expect(changes).toHaveBeenCalled();
  });

  it('plays the focus sound in the tab you used, only while focus runs', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        resume = () => Promise.resolve();
      },
    );
    const play = vi.spyOn(FocusSoundPlayer.prototype, 'play').mockImplementation(() => {});
    const stop = vi.spyOn(FocusSoundPlayer.prototype, 'stop').mockImplementation(() => {});
    try {
      const other = new WebTimerHost();
      const host = new WebTimerHost();
      await host.saveSettings({ ...DEFAULT_SETTINGS, focusSound: 'brown', focusVolume: 0.3 });
      const res = await host.send({ command: 'start' });
      const endTime = res.ok ? res.state.endTime : null;
      expect(play).toHaveBeenCalledWith('brown', 0.3, endTime);
      // Only the tab you clicked in plays it; the other tab stays quiet.
      expect(play).toHaveBeenCalledTimes(new Set(play.mock.contexts).size);
      other.load();

      play.mockClear();
      await host.send({ command: 'pause' });
      expect(stop).toHaveBeenCalled();
      expect(play).not.toHaveBeenCalled();

      // Breaks are quiet.
      await host.send({ command: 'skip' });
      await host.send({ command: 'start' });
      expect(play).not.toHaveBeenCalled();
    } finally {
      play.mockRestore();
      stop.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('keeps the timer across reloads', async () => {
    await new WebTimerHost().send({ command: 'start' });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    const { state } = await new WebTimerHost().load();
    expect(state.status).toBe('running');
    expect(state.endTime! - Date.now()).toBe(20 * 60_000);
  });

  it('applies new durations to an idle timer', async () => {
    const host = new WebTimerHost();
    await host.saveSettings({ ...DEFAULT_SETTINGS, workMinutes: 50 });
    const { state, settings } = await host.load();
    expect(settings.workMinutes).toBe(50);
    expect(state.remainingMs).toBe(50 * 60_000);
  });

  it('pauses, skips, and remembers the dismissed hint', async () => {
    const host = new WebTimerHost();
    await host.send({ command: 'start' });
    const paused = await host.send({ command: 'pause' });
    expect(paused.ok && paused.state.status).toBe('paused');
    const skipped = await host.send({ command: 'skip' });
    // Skipping doesn't count as a finished session.
    expect(skipped.ok && skipped.state).toMatchObject({ phase: 'shortBreak', completedToday: 0 });
    await host.dismissAlertHint();
    expect((await host.load()).alertHintDismissed).toBe(true);
  });

  it('records finished focus sessions in the stats history, and resets it', async () => {
    const host = new WebTimerHost();
    await host.send({ command: 'start' });
    await vi.advanceTimersByTimeAsync(25 * 60_000 + 100);
    // A skipped session doesn't count.
    await host.send({ command: 'skip' });
    await host.send({ command: 'skip' });
    const { history } = await host.load();
    expect(Object.values(history)).toEqual([{ pomodoros: 1, focusMinutes: 25 }]);

    await host.resetStats();
    expect((await host.load()).history).toEqual({});
  });

  it('records a "Just start" session as 10 focus minutes', async () => {
    const host = new WebTimerHost();
    await host.saveSettings({ ...DEFAULT_SETTINGS, justStart: true });
    const res = await host.send({ command: 'justStart' });
    expect(res.ok && res.state.remainingMs).toBe(10 * 60_000);
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 100);
    const { state, history } = await host.load();
    expect(state).toMatchObject({ phase: 'shortBreak', completedToday: 1 });
    expect(Object.values(history)).toEqual([{ pomodoros: 1, focusMinutes: 10 }]);
  });

  it('adds "Keep going" time to focus minutes without another pomodoro', async () => {
    const host = new WebTimerHost();
    await host.saveSettings({ ...DEFAULT_SETTINGS, keepGoing: true });
    await host.send({ command: 'start' });
    await vi.advanceTimersByTimeAsync(25 * 60_000 + 100);
    const res = await host.send({ command: 'keepGoing' });
    expect(res.ok && res.state).toMatchObject({ phase: 'work', remainingMs: 5 * 60_000 });
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 100);
    const { state, history } = await host.load();
    expect(state).toMatchObject({ phase: 'shortBreak', completedToday: 1 });
    expect(Object.values(history)).toEqual([{ pomodoros: 1, focusMinutes: 30 }]);
  });

  it('plays the heads-up tone once, a minute before the end', async () => {
    const host = new WebTimerHost();
    // No Web Audio in tests: stand in for unlocking and playing.
    vi.spyOn(host as unknown as { unlockAudio: () => void }, 'unlockAudio').mockReturnValue();
    const played = vi
      .spyOn(host as unknown as { playSound: () => Promise<void> }, 'playSound')
      .mockResolvedValue();
    await host.saveSettings({ ...DEFAULT_SETTINGS, headsUp: true, soundEnabled: true });
    await host.send({ command: 'start' });
    await vi.advanceTimersByTimeAsync(23 * 60_000);
    expect(played).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000 + 100);
    expect(played).toHaveBeenCalledWith('headsUp', DEFAULT_SETTINGS.volume);
    expect(played).toHaveBeenCalledTimes(1);
  });

  it('shows whole minutes in the tab title with the calm clock', async () => {
    const host = new WebTimerHost();
    await host.saveSettings({ ...DEFAULT_SETTINGS, calmClock: true });
    await host.send({ command: 'start' });
    expect(document.title).toBe('25 min Focus · Tomomomento');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(document.title).toBe('24 min Focus · Tomomomento');
  });

  it('asks "Still paused?" in the tab title after 10 minutes on pause', async () => {
    const host = new WebTimerHost();
    await host.saveSettings({ ...DEFAULT_SETTINGS, pauseNudge: true });
    await host.send({ command: 'start' });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await host.send({ command: 'pause' });
    expect(document.title).toBe('20:00 Focus (paused) · Tomomomento');
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 100);
    expect(document.title).toBe('Still paused? 20:00 Focus · Tomomomento');
    await host.send({ command: 'start' });
    expect(document.title).toBe('20:00 Focus · Tomomomento');
  });

  it("starts the history from today's tally saved before stats existed", async () => {
    const { state } = await new WebTimerHost().load();
    localStorage.setItem('tomatick.state', JSON.stringify({ ...state, completedToday: 2 }));
    const { history } = await new WebTimerHost().load();
    expect(history).toEqual({ [state.todayKey]: { pomodoros: 2, focusMinutes: 50 } });
  });
});
