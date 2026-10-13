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

  it("starts the history from today's tally saved before stats existed", async () => {
    const { state } = await new WebTimerHost().load();
    localStorage.setItem('tomatick.state', JSON.stringify({ ...state, completedToday: 2 }));
    const { history } = await new WebTimerHost().load();
    expect(history).toEqual({ [state.todayKey]: { pomodoros: 2, focusMinutes: 50 } });
  });
});
