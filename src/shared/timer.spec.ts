import {
  advance,
  calmMinutes,
  canJustStart,
  canKeepGoing,
  DEFAULT_SETTINGS,
  headsUpAt,
  inHeadsUp,
  formatClock,
  initialState,
  justStart,
  keepGoing,
  pause,
  pauseNudgeAt,
  phaseLengthMs,
  remainingMs,
  reset,
  rollDay,
  sanitizeSettings,
  setPhase,
  start,
  type TimerState,
} from './timer';

describe('timer state machine', () => {
  const s = DEFAULT_SETTINGS;
  const T0 = new Date(2026, 9, 5, 9, 0, 0).getTime();
  const MIN = 60_000;

  it('start, pause and resume keep the remaining time', () => {
    let st = start(initialState(s, T0), T0);
    expect(remainingMs(st, T0 + 10 * MIN)).toBe(15 * MIN);
    st = pause(st, T0 + 10 * MIN);
    expect(st.status).toBe('paused');
    expect(remainingMs(st, T0 + 60 * MIN)).toBe(15 * MIN);
    st = start(st, T0 + 60 * MIN);
    expect(st.endTime).toBe(T0 + 75 * MIN);
  });

  it('a completed focus session leads to a short break and counts', () => {
    const st = advance(start(initialState(s, T0), T0), s, T0 + 25 * MIN, true);
    expect(st.phase).toBe('shortBreak');
    expect(st.status).toBe('idle');
    expect(st.remainingMs).toBe(5 * MIN);
    expect(st.completedInCycle).toBe(1);
    expect(st.completedToday).toBe(1);
  });

  it('the fourth focus session leads to a long break, which resets the cycle', () => {
    let st: TimerState = initialState(s, T0);
    for (let i = 0; i < 4; i++) {
      st = advance(st, s, T0, true); // focus -> break
      if (i < 3) {
        expect(st.phase).toBe('shortBreak');
        st = advance(st, s, T0, true); // break -> focus
      }
    }
    expect(st.phase).toBe('longBreak');
    expect(st.remainingMs).toBe(15 * MIN);
    st = advance(st, s, T0, true);
    expect(st.phase).toBe('work');
    expect(st.completedInCycle).toBe(0);
    expect(st.completedToday).toBe(4);
  });

  it('skipping a focus session does not count it', () => {
    const st = advance(initialState(s, T0), s, T0, false);
    expect(st.phase).toBe('shortBreak');
    expect(st.completedInCycle).toBe(0);
    expect(st.completedToday).toBe(0);
  });

  it('auto-start settings start the next phase', () => {
    const auto = { ...s, autoStartBreaks: true };
    const st = advance(initialState(auto, T0), auto, T0, true);
    expect(st.status).toBe('running');
    expect(st.endTime).toBe(T0 + 5 * MIN);
  });

  it('the daily tally resets on a new day', () => {
    let st = advance(initialState(s, T0), s, T0, true);
    st = advance(st, s, T0, true); // back to focus
    st = advance(st, s, T0 + 24 * 60 * MIN, true);
    expect(st.completedToday).toBe(1);
  });

  it('a new day also starts a fresh cycle toward the long break', () => {
    let st = advance(initialState(s, T0), s, T0, true);
    st = advance(st, s, T0, true); // back to focus
    st = rollDay(st, T0 + 24 * 60 * MIN);
    expect(st.completedToday).toBe(0);
    expect(st.completedInCycle).toBe(0);
  });

  it('a focus session that ended yesterday counts toward yesterday, not today', () => {
    const tomorrow = T0 + 24 * 60 * MIN;
    const running = start(initialState(s, T0), T0);
    const st = advance(running, s, tomorrow, true, running.endTime!);
    expect(st.phase).toBe('shortBreak');
    expect(st.completedToday).toBe(0);
    expect(st.completedInCycle).toBe(0);
  });

  it('a focus session that ended earlier today still counts when caught up', () => {
    const running = start(initialState(s, T0), T0);
    const st = advance(running, s, T0 + 60 * MIN, true, running.endTime!);
    expect(st.completedToday).toBe(1);
    expect(st.completedInCycle).toBe(1);
  });

  it('only a finished focus session counts, never a break', () => {
    let st = advance(initialState(s, T0), s, T0, false); // skip focus
    st = advance(start(st, T0), s, T0 + 5 * MIN, true); // short break runs out
    expect(st.phase).toBe('work');
    expect(st.completedToday).toBe(0);
    expect(st.completedInCycle).toBe(0);
  });

  it('reset restores the full phase length', () => {
    const st = reset(pause(start(initialState(s, T0), T0), T0 + 3 * MIN), s);
    expect(st.status).toBe('idle');
    expect(st.remainingMs).toBe(25 * MIN);
  });

  it('formatClock rounds up to whole seconds', () => {
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(0)).toBe('00:00');
  });

  it('setPhase jumps to a phase without counting it', () => {
    const st = setPhase(start(initialState(s, T0), T0), 'longBreak', s);
    expect(st.phase).toBe('longBreak');
    expect(st.status).toBe('idle');
    expect(st.remainingMs).toBe(15 * MIN);
    expect(st.completedToday).toBe(0);
  });

  it('defaults are the classic 25/5/15 with alerts off', () => {
    expect([
      s.workMinutes,
      s.shortBreakMinutes,
      s.longBreakMinutes,
      s.sessionsBeforeLongBreak,
    ]).toEqual([25, 5, 15, 4]);
    expect(s.soundEnabled).toBe(false);
    expect(s.notificationsEnabled).toBe(false);
  });

  it('sanitizeSettings clamps bad input', () => {
    const out = sanitizeSettings({ workMinutes: 0, shortBreakMinutes: 999, longBreakMinutes: NaN });
    expect(out.workMinutes).toBe(1);
    expect(out.shortBreakMinutes).toBe(60);
    expect(out.longBreakMinutes).toBe(15);
    expect(sanitizeSettings({ volume: 4, sound: 'kazoo' as never }).volume).toBe(1);
    expect(sanitizeSettings({ sound: 'kazoo' as never }).sound).toBe('bell');
  });

  it('sanitizeSettings keeps a valid theme and defaults to the system one', () => {
    expect(sanitizeSettings({}).theme).toBe('system');
    expect(sanitizeSettings({ theme: 'dark' }).theme).toBe('dark');
    expect(sanitizeSettings({ theme: 'purple' as never }).theme).toBe('system');
  });

  it('sanitizeSettings keeps quotes off unless turned on', () => {
    expect(sanitizeSettings({}).showQuotes).toBe(false);
    expect(sanitizeSettings({ showQuotes: true }).showQuotes).toBe(true);
  });

  describe('just start', () => {
    const on = { ...s, justStart: true };

    it('is offered only for a focus session that has not begun', () => {
      const fresh = initialState(on, T0);
      expect(canJustStart(fresh, on)).toBe(true);
      expect(canJustStart(fresh, s)).toBe(false);
      expect(canJustStart(start(fresh, T0), on)).toBe(false);
      expect(canJustStart(pause(start(fresh, T0), T0 + MIN), on)).toBe(false);
      expect(canJustStart(setPhase(fresh, 'shortBreak', on), on)).toBe(false);
      // Nothing to shorten when focus is already 10 minutes or less.
      const tenMinutes = { ...on, workMinutes: 10 };
      expect(canJustStart(initialState(tenMinutes, T0), tenMinutes)).toBe(false);
    });

    it('runs a 10-minute focus session that counts like any other', () => {
      const st = justStart(initialState(on, T0), on, T0);
      expect(st).toMatchObject({ status: 'running', endTime: T0 + 10 * MIN });
      expect(phaseLengthMs(st, on)).toBe(10 * MIN);
      expect(remainingMs(st, T0 + 4 * MIN)).toBe(6 * MIN);

      const next = advance(st, on, T0 + 10 * MIN, true);
      expect(next).toMatchObject({ phase: 'shortBreak', completedToday: 1, completedInCycle: 1 });
      expect(next.phaseMs).toBeUndefined();
      expect(phaseLengthMs(next, on)).toBe(5 * MIN);
    });

    it('goes back to the usual length on reset or a phase change', () => {
      const st = pause(justStart(initialState(on, T0), on, T0), T0 + MIN);
      expect(reset(st, on)).toMatchObject({ remainingMs: 25 * MIN });
      expect(reset(st, on).phaseMs).toBeUndefined();
      expect(setPhase(st, 'shortBreak', on).phaseMs).toBeUndefined();
    });

    it('does nothing when not offered', () => {
      const st = initialState(s, T0);
      expect(justStart(st, s, T0)).toBe(st);
    });

    it('stays off unless turned on', () => {
      expect(sanitizeSettings({}).justStart).toBe(false);
      expect(sanitizeSettings({ justStart: true }).justStart).toBe(true);
    });
  });

  describe('keep going', () => {
    const on = { ...s, keepGoing: true };
    const finished = () => advance(start(initialState(on, T0), T0), on, T0 + 25 * MIN, true);

    it('is offered on the break after a focus session runs out', () => {
      expect(canKeepGoing(finished(), on)).toBe(true);
      expect(canKeepGoing(finished(), s)).toBe(false);
      // Not after a skipped session, and not once you leave the break.
      expect(canKeepGoing(advance(initialState(on, T0), on, T0, false), on)).toBe(false);
      expect(canKeepGoing(reset(finished(), on), on)).toBe(false);
      expect(canKeepGoing(setPhase(finished(), 'longBreak', on), on)).toBe(false);
      // Starting the break keeps the offer open.
      expect(canKeepGoing(start(finished(), T0 + 26 * MIN), on)).toBe(true);
    });

    it('adds 5 minutes of focus that does not count another pomodoro', () => {
      const st = keepGoing(finished(), on, T0 + 26 * MIN);
      expect(st).toMatchObject({ phase: 'work', status: 'running', extending: true });
      expect(phaseLengthMs(st, on)).toBe(5 * MIN);

      const back = advance(st, on, T0 + 31 * MIN, true);
      expect(back).toMatchObject({ phase: 'shortBreak', completedToday: 1, completedInCycle: 1 });
      expect(back.extending).toBeUndefined();
      // And again, if you're still going.
      expect(canKeepGoing(back, on)).toBe(true);
    });

    it('comes back to the long break it put off', () => {
      let st = initialState(on, T0);
      for (let i = 0; i < 4; i++) {
        st = advance(start(st, T0), on, T0, true); // focus runs out
        if (i < 3) st = advance(st, on, T0, false); // skip the short break
      }
      expect(st.phase).toBe('longBreak');
      st = advance(keepGoing(st, on, T0), on, T0 + 5 * MIN, true);
      expect(st).toMatchObject({ phase: 'longBreak', completedInCycle: 4 });
    });

    it('does nothing when not offered', () => {
      const st = initialState(on, T0);
      expect(keepGoing(st, on, T0)).toBe(st);
    });

    it('stays off unless turned on', () => {
      expect(sanitizeSettings({}).keepGoing).toBe(false);
    });
  });

  describe('heads-up', () => {
    const on = { ...s, headsUp: true };

    it('comes a minute before a running phase ends', () => {
      const st = start(initialState(on, T0), T0);
      expect(headsUpAt(st, on)).toBe(T0 + 24 * MIN);
      expect(inHeadsUp(st, on, T0 + 23 * MIN)).toBe(false);
      expect(inHeadsUp(st, on, T0 + 24 * MIN)).toBe(true);
      expect(inHeadsUp(st, on, T0 + 25 * MIN)).toBe(false);
    });

    it('stays quiet when off, paused, idle, or for very short phases', () => {
      const running = start(initialState(on, T0), T0);
      expect(headsUpAt(start(initialState(s, T0), T0), s)).toBeNull();
      expect(headsUpAt(pause(running, T0 + MIN), on)).toBeNull();
      expect(headsUpAt(initialState(on, T0), on)).toBeNull();
      const short = { ...on, shortBreakMinutes: 2 };
      const brk = start(setPhase(initialState(short, T0), 'shortBreak', short), T0);
      expect(headsUpAt(brk, short)).toBeNull();
    });

    it('follows a "Just start" length', () => {
      const both = { ...on, justStart: true };
      expect(headsUpAt(justStart(initialState(both, T0), both, T0), both)).toBe(T0 + 9 * MIN);
    });

    it('stays off unless turned on', () => {
      expect(sanitizeSettings({}).headsUp).toBe(false);
    });
  });

  it('the calm clock shows whole minutes, rounded up', () => {
    expect(calmMinutes(25 * MIN)).toBe(25);
    expect(calmMinutes(24 * MIN + 1000)).toBe(25);
    expect(calmMinutes(24 * MIN)).toBe(24);
    expect(calmMinutes(30_000)).toBe(1);
    expect(calmMinutes(0)).toBe(0);
    expect(sanitizeSettings({}).calmClock).toBe(false);
  });

  describe('paused reminder', () => {
    const on = { ...s, pauseNudge: true };

    it('comes 10 minutes after pausing, once per pause', () => {
      const paused = pause(start(initialState(on, T0), T0), T0 + 3 * MIN);
      expect(paused.pausedAt).toBe(T0 + 3 * MIN);
      expect(pauseNudgeAt(paused, on)).toBe(T0 + 13 * MIN);
      expect(pauseNudgeAt(paused, s)).toBeNull();
    });

    it('is cleared by resuming, restarting, or moving on', () => {
      const paused = pause(start(initialState(on, T0), T0), T0 + 3 * MIN);
      expect(start(paused, T0 + 20 * MIN).pausedAt).toBeUndefined();
      expect(reset(paused, on).pausedAt).toBeUndefined();
      expect(advance(paused, on, T0 + 20 * MIN, false).pausedAt).toBeUndefined();
      expect(pauseNudgeAt(start(paused, T0 + 20 * MIN), on)).toBeNull();
    });

    it('stays off unless turned on', () => {
      expect(sanitizeSettings({}).pauseNudge).toBe(false);
    });
  });
});
