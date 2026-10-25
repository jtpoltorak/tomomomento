import {
  advance,
  canAskFirstStep,
  withFirstStep,
  applyRhythm,
  rhythmOf,
  breathAt,
  breathSecondsLeft,
  nextHour,
  timeCheckDue,
  timeCheckText,
  canSettle,
  careNudge,
  calmMinutes,
  canJustStart,
  canKeepGoing,
  DEFAULT_SETTINGS,
  focusSoundNow,
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
  settleStart,
  settling,
  skipSettle,
  smallWin,
  start,
  stepAway,
  wasWorking,
  type Settings,
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

  describe('settle in', () => {
    const on = { ...s, settleIn: true };
    const SETTLE = 30_000;

    it('breathes for 30 seconds before the focus clock runs', () => {
      const st = settleStart(initialState(on, T0), on, T0);
      expect(st).toMatchObject({ status: 'running', endTime: T0 + SETTLE + 25 * MIN });
      expect(settling(st, T0 + 10_000)).toBe(true);
      // The clock holds at the full length while you breathe.
      expect(remainingMs(st, T0 + 10_000)).toBe(25 * MIN);
      expect(settling(st, T0 + SETTLE)).toBe(false);
      expect(remainingMs(st, T0 + SETTLE + MIN)).toBe(24 * MIN);
    });

    it('breathes in for 4 seconds and out for 6', () => {
      const st = settleStart(initialState(on, T0), on, T0);
      expect(breathAt(st, T0)).toBe('in');
      expect(breathAt(st, T0 + 3_900)).toBe('in');
      expect(breathAt(st, T0 + 4_000)).toBe('out');
      expect(breathAt(st, T0 + 9_900)).toBe('out');
      expect(breathAt(st, T0 + 10_000)).toBe('in');
    });

    it('counts down the seconds left in each breath', () => {
      const st = settleStart(initialState(on, T0), on, T0);
      expect(breathSecondsLeft(st, T0)).toBe(4);
      expect(breathSecondsLeft(st, T0 + 3_100)).toBe(1);
      expect(breathSecondsLeft(st, T0 + 4_000)).toBe(6);
      expect(breathSecondsLeft(st, T0 + 9_500)).toBe(1);
      expect(breathSecondsLeft(st, T0 + 10_000)).toBe(4);
    });

    it('starts the clock right away on "Start now"', () => {
      const st = skipSettle(settleStart(initialState(on, T0), on, T0), T0 + 5_000);
      expect(st.settleUntil).toBeUndefined();
      expect(st.endTime).toBe(T0 + 5_000 + 25 * MIN);
      expect(remainingMs(st, T0 + 5_000 + MIN)).toBe(24 * MIN);
    });

    it('keeps the full length when paused mid-breath, and resumes without it', () => {
      const paused = pause(settleStart(initialState(on, T0), on, T0), T0 + 5_000);
      expect(paused).toMatchObject({ status: 'paused', remainingMs: 25 * MIN });
      expect(paused.settleUntil).toBeUndefined();
      // The time is the same, but the session has begun, so resuming goes straight in.
      expect(canSettle(paused, on)).toBe(false);
    });

    it('only comes before a focus session that has not begun', () => {
      const fresh = initialState(on, T0);
      expect(canSettle(fresh, on)).toBe(true);
      expect(canSettle(fresh, s)).toBe(false);
      expect(canSettle(setPhase(fresh, 'shortBreak', on), on)).toBe(false);
      expect(canSettle({ ...fresh, remainingMs: 20 * MIN }, on)).toBe(false);
      const plain = settleStart(fresh, s, T0);
      expect(plain).toEqual(start(fresh, T0));
    });

    it('counts a settled session like any other once it runs out', () => {
      const st = settleStart(initialState(on, T0), on, T0);
      const next = advance(st, on, st.endTime!, true);
      expect(next).toMatchObject({ phase: 'shortBreak', completedToday: 1 });
      expect(next.settleUntil).toBeUndefined();
    });

    it('stays off unless turned on', () => {
      expect(sanitizeSettings({}).settleIn).toBe(false);
      expect(sanitizeSettings({ settleIn: true }).settleIn).toBe(true);
    });
  });

  describe('step away', () => {
    const on = { ...s, awayCheck: true, pauseNudge: true };
    const running = start(initialState(on, T0), T0);

    it('pauses focus as of when you left', () => {
      const away = stepAway(running, on, T0 + 10 * MIN, T0 + 15 * MIN);
      expect(away).toMatchObject({
        status: 'paused',
        away: true,
        remainingMs: 15 * MIN,
        pausedAt: T0 + 10 * MIN,
      });
      // Coming back asks, so the "still paused?" reminder stays out of it.
      expect(pauseNudgeAt(away, on)).toBeNull();
    });

    it("can't count time from before the session began", () => {
      const away = stepAway(running, on, T0 - 3 * MIN, T0 + 2 * MIN);
      expect(away).toMatchObject({ remainingMs: 25 * MIN, pausedAt: T0 });
    });

    it('leaves breaks, paused timers, and anyone who turned it off alone', () => {
      const brk = start(setPhase(running, 'shortBreak', on), T0);
      expect(stepAway(brk, on, T0, T0 + MIN)).toBe(brk);
      const paused = pause(running, T0 + MIN);
      expect(stepAway(paused, on, T0, T0 + 2 * MIN)).toBe(paused);
      expect(stepAway(running, s, T0, T0 + MIN)).toBe(running);
    });

    it('resumes where you left off', () => {
      const away = stepAway(running, on, T0 + 10 * MIN, T0 + 15 * MIN);
      const back = start(away, T0 + 30 * MIN);
      expect(back).toMatchObject({ status: 'running', endTime: T0 + 45 * MIN });
      expect(back.away).toBeUndefined();
    });

    it('counts the time away when you were working after all', () => {
      const away = stepAway(running, on, T0 + 10 * MIN, T0 + 15 * MIN);
      const back = wasWorking(away, T0 + 18 * MIN);
      expect(back).toMatchObject({ status: 'running', endTime: T0 + 25 * MIN });
      expect(back.away).toBeUndefined();
      // Away longer than the session had left: it's done, and finishes right away.
      expect(wasWorking(away, T0 + 50 * MIN).endTime).toBe(T0 + 50 * MIN);
      // Only for an "away" pause.
      const paused = pause(running, T0 + MIN);
      expect(wasWorking(paused, T0 + 5 * MIN)).toBe(paused);
    });

    it('stays off unless turned on', () => {
      expect(sanitizeSettings({}).awayCheck).toBe(false);
      expect(sanitizeSettings({ awayCheck: true }).awayCheck).toBe(true);
    });
  });

  describe('small wins', () => {
    const on = { ...s, smallWins: true };
    const finished = advance(start(initialState(on, T0), T0), on, T0 + 25 * MIN, true);

    it('celebrates a focus session that just finished, once', () => {
      expect(smallWin(finished, on, null, T0 + 25 * MIN)).toBe('Nice work! 1 done today.');
      expect(smallWin(finished, on, T0 + 25 * MIN, T0 + 26 * MIN)).toBeNull();
      expect(smallWin(finished, s, null, T0 + 25 * MIN)).toBeNull();
    });

    it('changes its words as the day goes on', () => {
      const second = { ...finished, completedToday: 2 };
      expect(smallWin(second, on, null, T0 + 25 * MIN)).toBe('Well done! 2 done today.');
    });

    it('lets old sessions go, and skips skipped ones', () => {
      expect(smallWin(finished, on, null, T0 + 60 * MIN)).toBeNull();
      const skipped = advance(start(initialState(on, T0), T0), on, T0 + MIN, false);
      expect(smallWin(skipped, on, null, T0 + MIN)).toBeNull();
    });

    it('stays off unless turned on', () => {
      expect(sanitizeSettings({}).smallWins).toBe(false);
      expect(sanitizeSettings({ smallWins: true }).smallWins).toBe(true);
    });
  });

  describe('take-care reminders', () => {
    const on = { ...s, takeCare: true };
    /** Runs focus sessions back to back with 5-minute breaks, starting at `from`. */
    function sessions(n: number, from = T0, st = initialState(on, from)): TimerState {
      let t = from;
      for (let i = 0; i < n; i++) {
        st = start(st.phase === 'work' ? st : advance(st, on, t, false), t);
        t += 25 * MIN;
        st = advance(st, on, t, true);
        t += 5 * MIN;
      }
      return st;
    }

    it('counts focus sessions in a row', () => {
      expect(sessions(1).inARow).toBe(1);
      expect(sessions(4).inARow).toBe(4);
    });

    it('reminds you on the break after every third one, a different reminder each time', () => {
      expect(careNudge(sessions(2), on)).toBeNull();
      expect(careNudge(sessions(3), on)).toBe('3 in a row. Have a glass of water');
      expect(careNudge(sessions(4), on)).toBeNull();
      expect(careNudge(sessions(6), on)).toBe('6 in a row. Rest your eyes on something far away');
      expect(careNudge(sessions(3), s)).toBeNull();
    });

    it('starts a new run after a long gap', () => {
      const first = sessions(2);
      // Back after lunch: an hour and a half later.
      const later = sessions(1, T0 + 2 * 30 * MIN + 90 * MIN, first);
      expect(later.inARow).toBe(1);
      // A long break between sessions keeps the run going.
      const afterLong = sessions(1, T0 + 2 * 30 * MIN + 15 * MIN, first);
      expect(afterLong.inARow).toBe(3);
    });

    it("doesn't count skipped sessions or extra time", () => {
      const st = sessions(2);
      const skipped = advance(start(advance(st, on, T0, false), T0), on, T0 + MIN, false);
      expect(skipped.inARow).toBe(2);
      const extra = advance(keepGoing(st, { ...on, keepGoing: true }, T0), on, T0 + 5 * MIN, true);
      expect(extra.inARow).toBe(2);
    });

    it('stays off unless turned on', () => {
      expect(sanitizeSettings({}).takeCare).toBe(false);
      expect(sanitizeSettings({ takeCare: true }).takeCare).toBe(true);
    });
  });

  describe('first tiny step', () => {
    const on = { ...DEFAULT_SETTINGS, firstStep: true };

    it('asks only before a fresh focus session', () => {
      const fresh = initialState(on, 0);
      expect(canAskFirstStep(fresh, on)).toBe(true);
      expect(canAskFirstStep(fresh, DEFAULT_SETTINGS)).toBe(false);
      expect(canAskFirstStep(pause(start(fresh, 0), 60_000), on)).toBe(false);
      expect(canAskFirstStep(setPhase(fresh, 'shortBreak', on), on)).toBe(false);
    });

    it('keeps a tidy step for the session, and drops it when the session ends', () => {
      const fresh = initialState(on, 0);
      expect(withFirstStep(fresh, '   ').firstStep).toBeUndefined();
      const running = start(withFirstStep(fresh, '  open   the doc '), 0);
      expect(running.firstStep).toBe('open the doc');
      expect(withFirstStep(fresh, 'x'.repeat(200)).firstStep?.length).toBe(80);
      expect(pause(running, 1000).firstStep).toBe('open the doc');
      expect(advance(running, on, running.endTime!, true).firstStep).toBeUndefined();
    });
  });

  describe('rhythm presets', () => {
    it('knows which preset the timers match', () => {
      expect(rhythmOf(DEFAULT_SETTINGS)).toBe('classic');
      expect(rhythmOf({ ...DEFAULT_SETTINGS, workMinutes: 30 })).toBeNull();
    });

    it('sets all three timer lengths and nothing else', () => {
      const deep = applyRhythm({ ...DEFAULT_SETTINGS, sessionsBeforeLongBreak: 3 }, 'deep');
      expect(deep).toMatchObject({
        workMinutes: 50,
        shortBreakMinutes: 10,
        longBreakMinutes: 20,
        sessionsBeforeLongBreak: 3,
      });
      expect(rhythmOf(applyRhythm(DEFAULT_SETTINGS, 'short'))).toBe('short');
    });

    it('is off unless turned on', () => {
      expect(DEFAULT_SETTINGS.rhythmPresets).toBe(false);
      expect(sanitizeSettings({ rhythmPresets: true }).rhythmPresets).toBe(true);
    });
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
    expect(sanitizeSettings({}).visualTimer).toBe(false);
    expect(sanitizeSettings({}).liveIcon).toBe(false);
    expect(sanitizeSettings({}).bigTimer).toBe(false);
    expect(sanitizeSettings({}).breathCircle).toBe(false);
    expect(sanitizeSettings({}).focusGarden).toBe(false);
    expect(sanitizeSettings({}).colorTheme).toBe('classic');
    expect(sanitizeSettings({}).pickForMe).toBe(false);
    expect(sanitizeSettings({}).stickerBook).toBe(false);
    expect(sanitizeSettings({}).focusBuddy).toBe(false);
    expect(sanitizeSettings({ colorTheme: 'neon' as never }).colorTheme).toBe('classic');
    expect(sanitizeSettings({}).dailyIntention).toBe(false);
    expect(sanitizeSettings({}).whereWasI).toBe(false);
    expect(sanitizeSettings({}).timeCheck).toBe(false);
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

  describe('focus sound', () => {
    const running = (phase: TimerState['phase'], status: TimerState['status'] = 'running') => ({
      ...initialState(DEFAULT_SETTINGS, 0),
      phase,
      status,
      endTime: status === 'running' ? 1_000_000 : null,
    });

    it('plays only while focus runs, and is off by default', () => {
      expect(focusSoundNow(running('work'), DEFAULT_SETTINGS)).toBeNull();
      const settings = { ...DEFAULT_SETTINGS, focusSound: 'tick' as const };
      expect(focusSoundNow(running('work'), settings)).toBe('tick');
      expect(focusSoundNow(running('work', 'paused'), settings)).toBeNull();
      expect(focusSoundNow(running('work', 'idle'), settings)).toBeNull();
      expect(focusSoundNow(running('shortBreak'), settings)).toBeNull();
    });

    it('cleans up stored values', () => {
      const bad = { focusSound: 'whale song', focusVolume: 7 } as unknown as Partial<Settings>;
      expect(sanitizeSettings(bad)).toMatchObject({ focusSound: 'off', focusVolume: 1 });
      expect(sanitizeSettings({})).toMatchObject({ focusSound: 'off', focusVolume: 0.4 });
      expect(sanitizeSettings({ focusSound: 'rain' }).focusSound).toBe('rain');
      expect(sanitizeSettings({ focusSound: 'waves' }).focusSound).toBe('waves');
    });
  });

  describe('accessibility settings', () => {
    it('are all off by default and keep only known text sizes', () => {
      expect(sanitizeSettings({})).toMatchObject({
        highContrast: false,
        colorSafe: false,
        textSize: 'normal',
        easyFont: false,
        reduceMotion: false,
      });
      const bad = { textSize: 'huge' } as unknown as Partial<Settings>;
      expect(sanitizeSettings(bad).textSize).toBe('normal');
      expect(sanitizeSettings({ textSize: 'xlarge' }).textSize).toBe('xlarge');
    });
  });

  describe('hourly time check', () => {
    const at = (h: number, m = 0, sec = 0) => new Date(2026, 9, 23, h, m, sec).getTime();
    const on = { ...DEFAULT_SETTINGS, timeCheck: true };

    it('is due on the hour in waking hours, and stays quiet when late or off', () => {
      expect(nextHour(at(14, 37))).toBe(at(15));
      expect(timeCheckDue(on, at(15, 0, 3))).toBe(at(15));
      expect(timeCheckDue(on, at(15, 5))).toBeNull(); // the computer slept through it
      expect(timeCheckDue(on, at(7, 0, 1))).toBeNull();
      expect(timeCheckDue(on, at(21, 0, 1))).toBe(at(21));
      expect(timeCheckDue(on, at(22, 0, 1))).toBeNull();
      expect(timeCheckDue(DEFAULT_SETTINGS, at(15))).toBeNull();
    });

    it('says the hour, and how a running timer stands', () => {
      const idle = initialState(DEFAULT_SETTINGS, at(15));
      expect(timeCheckText(idle, at(15))).toEqual({
        title: "It's 3 PM",
        body: 'A quick time check.',
      });
      const running = { ...idle, status: 'running' as const, endTime: at(15, 12) };
      expect(timeCheckText(running, at(15)).body).toBe('Focus has 12 min left.');
      expect(timeCheckText(idle, at(12)).title).toBe("It's 12 PM");
    });
  });
});
