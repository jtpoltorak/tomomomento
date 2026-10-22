// Background service worker: the single source of truth for the timer.
//
// MV3 service workers are shut down when idle, so nothing here relies on
// in-memory state or setInterval. The timer is stored as an absolute end time
// in chrome.storage, and a chrome.alarms alarm wakes the worker when it is due.

import type {
  Command,
  CommandMessage,
  CommandResponse,
  FocusSoundMessage,
  PlaySoundMessage,
} from '../shared/messages';
import {
  addSite,
  BLOCKER_PERMISSIONS,
  hostMatches,
  normalizeSite,
  shouldBlock,
  SUGGESTED_SITES,
} from '../shared/blocker';
import { parkThought } from '../shared/parking';
import { planDoneMessage } from '../shared/plan';
import type { AlertSound } from '../shared/sounds';
import { addFocusMinutes, recordPomodoro } from '../shared/stats';
import {
  loadHistory,
  loadParkingLot,
  loadPlan,
  loadSettings,
  loadState,
  saveHistory,
  saveParkingLot,
  saveSettings,
  saveState,
} from '../shared/storage';
import {
  advance,
  careNudge,
  AWAY_MS,
  focusSoundNow,
  headsUpAt,
  canKeepGoing,
  justStart,
  KEEP_GOING_MINUTES,
  keepGoing,
  pause,
  pauseNudgeAt,
  phaseLengthMs,
  PHASE_LABELS,
  remainingMs,
  reset,
  rollDay,
  setPhase,
  settleStart,
  withFirstStep,
  skipSettle,
  stepAway,
  wasWorking,
  type Phase,
  type Settings,
  type TimerState,
} from '../shared/timer';

const PHASE_END_ALARM = 'phase-end';
const BADGE_ALARM = 'badge-refresh';
const HEADS_UP_ALARM = 'heads-up';
const PAUSE_NUDGE_ALARM = 'pause-nudge';
const NOTIFICATION_ID = 'phase-complete';
const PAUSE_NOTIFICATION_ID = 'still-paused';
const AWAY_NOTIFICATION_ID = 'welcome-back';

const BADGE_COLORS: Record<Phase, string> = {
  work: '#d9480f',
  shortBreak: '#2f9e44',
  longBreak: '#1971c2',
};
/** The color-blind safe palette's light colors, which carry white badge text. */
const SAFE_BADGE_COLORS: Record<Phase, string> = {
  work: '#b84a00',
  shortBreak: '#0067a5',
  longBreak: '#9c3c78',
};
const PAUSED_BADGE_COLOR = '#868e96';

// Serialize every state mutation so a click and an alarm can't interleave.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function commit(state: TimerState): Promise<TimerState> {
  await saveState(state);
  await syncAlarms(state);
  await updateBadge(state);
  await syncBlocking(state);
  await syncFocusSound(state);
  return state;
}

const BLOCK_RULE_ID = 1;

/**
 * Turns the site blocker's redirect rule on during focus sessions and off
 * otherwise. Without the optional permissions, chrome.declarativeNetRequest
 * doesn't exist and there is nothing to do.
 */
async function syncBlocking(state: TimerState, settings?: Settings): Promise<void> {
  if (!chrome.declarativeNetRequest) return;
  settings ??= await loadSettings();
  const active = shouldBlock(state, settings);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [BLOCK_RULE_ID],
    addRules: active
      ? [
          {
            id: BLOCK_RULE_ID,
            priority: 1,
            action: {
              type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
              // The original URL rides along after the #, so the blocked page can link back to it.
              redirect: { regexSubstitution: `${chrome.runtime.getURL('blocked.html')}#\\0` },
            },
            condition: {
              regexFilter: '^.+$',
              requestDomains: settings.blockedSites,
              resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
            },
          },
        ]
      : [],
  });
  if (active) await redirectOpenTabs(settings.blockedSites);
}

/** The rule only catches new page loads, so also move tabs that are already open. */
async function redirectOpenTabs(sites: string[]): Promise<void> {
  const patterns = sites.flatMap((site) => [`*://${site}/*`, `*://*.${site}/*`]);
  const tabs = await chrome.tabs.query({ url: patterns });
  const blockedPage = chrome.runtime.getURL('blocked.html');
  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id !== undefined && tab.url)
      .filter((tab) => sites.some((site) => hostMatches(new URL(tab.url!).hostname, site)))
      .map((tab) => chrome.tabs.update(tab.id!, { url: `${blockedPage}#${tab.url}` })),
  );
}

async function syncAlarms(state: TimerState, settings?: Settings): Promise<void> {
  if (state.status === 'running' && state.endTime !== null) {
    await chrome.alarms.create(PHASE_END_ALARM, { when: state.endTime });
    // 0.5 minutes is the shortest period Chrome allows.
    await chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 0.5 });
  } else {
    await chrome.alarms.clear(PHASE_END_ALARM);
    await chrome.alarms.clear(BADGE_ALARM);
  }
  settings ??= await loadSettings();
  const headsUp = headsUpAt(state, settings);
  if (headsUp !== null && headsUp > Date.now()) {
    await chrome.alarms.create(HEADS_UP_ALARM, { when: headsUp });
  } else {
    await chrome.alarms.clear(HEADS_UP_ALARM);
  }
  const nudge = pauseNudgeAt(state, settings);
  if (nudge !== null) {
    await chrome.alarms.create(PAUSE_NUDGE_ALARM, { when: Math.max(nudge, Date.now()) });
  } else {
    await chrome.alarms.clear(PAUSE_NUDGE_ALARM);
  }
}

/** A quiet "still paused?" notification, once per pause. */
function pauseNudge(): Promise<void> {
  return serialized(async () => {
    const [state, settings] = await Promise.all([loadState(), loadSettings()]);
    const at = pauseNudgeAt(state, settings);
    if (at === null || Date.now() < at - 1000) return;
    const minutesLeft = Math.ceil(state.remainingMs / 60_000);
    await chrome.notifications.create(PAUSE_NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: 'Still paused',
      message: `${PHASE_LABELS[state.phase]} has ${minutesLeft} min left. Pick it back up?`,
      buttons: [{ title: 'Resume' }, { title: 'Start over' }],
      silent: true,
      priority: 0,
    });
  });
}

/** The quiet tone a minute before the phase ends, for people who turned sound on. */
function headsUp(): Promise<void> {
  return serialized(async () => {
    const [state, settings] = await Promise.all([loadState(), loadSettings()]);
    const at = headsUpAt(state, settings);
    // A late alarm (the computer slept) shouldn't chime once the minute is mostly gone.
    const now = Date.now();
    if (at === null || now < at - 1000 || now > at + 20_000 || !settings.soundEnabled) return;
    await playAlertSound('headsUp', settings.volume).catch((err: unknown) =>
      console.error('Heads-up failed', err),
    );
  });
}

async function updateBadge(state: TimerState, justFinished = false): Promise<void> {
  const colors = (await loadSettings()).colorSafe ? SAFE_BADGE_COLORS : BADGE_COLORS;
  if (state.status === 'idle' && justFinished) {
    // A quiet "time's up" cue for people who leave sounds and notifications off.
    await chrome.action.setBadgeBackgroundColor({ color: colors[state.phase] });
    await chrome.action.setBadgeText({ text: '✓' });
    await chrome.action.setTitle({
      title: `Tomomomento: time for your ${PHASE_LABELS[state.phase].toLowerCase()}`,
    });
    return;
  }
  if (state.status === 'idle') {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: `Tomomomento: ${PHASE_LABELS[state.phase]} ready` });
    return;
  }
  const minutesLeft = Math.ceil(remainingMs(state, Date.now()) / 60_000);
  const color = state.status === 'paused' ? PAUSED_BADGE_COLOR : colors[state.phase];
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  await chrome.action.setBadgeText({ text: `${minutesLeft}m` });
  const verb = state.status === 'paused' ? 'paused' : 'running';
  await chrome.action.setTitle({
    title: `Tomomomento: ${PHASE_LABELS[state.phase]} ${verb}, ${minutesLeft} min left`,
  });
}

const OFFSCREEN_URL = 'offscreen.html';

/** The hidden page that plays sounds, since service workers have no audio output. */
async function hasOffscreen(): Promise<boolean> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  return existing.length > 0;
}

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: 'Play the alert and focus sounds the user turned on.',
  });
}

async function playAlertSound(sound: AlertSound, volume: number): Promise<void> {
  await ensureOffscreen();
  const message: PlaySoundMessage = {
    type: 'play-sound',
    target: 'offscreen',
    sound,
    volume,
  };
  await chrome.runtime.sendMessage(message);
}

/** Plays the focus sound while focus runs, and stops it otherwise. */
async function syncFocusSound(state: TimerState, settings?: Settings): Promise<void> {
  settings ??= await loadSettings();
  const sound = focusSoundNow(state, settings);
  // Nothing is playing without the page, so there's nothing to stop.
  if (!sound && !(await hasOffscreen())) return;
  try {
    if (sound) await ensureOffscreen();
    const message: FocusSoundMessage = {
      type: 'focus-sound',
      target: 'offscreen',
      sound,
      volume: settings.focusVolume,
      endTime: state.endTime,
    };
    await chrome.runtime.sendMessage(message);
  } catch (err) {
    console.error('Focus sound failed', err);
  }
}

async function alertPhaseComplete(
  finished: Phase,
  next: TimerState,
  settings: Settings,
  extended = false,
): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (settings.soundEnabled) tasks.push(playAlertSound(settings.sound, settings.volume));
  if (settings.notificationsEnabled) {
    const planLine =
      finished === 'work' && !extended ? planDoneMessage(await loadPlan(), settings, next) : null;
    const care = careNudge(next, settings);
    const lines = [planLine, care && `${care}.`].filter(Boolean).join(' ') || null;
    tasks.push(showNotification(finished, next, lines, extended, canKeepGoing(next, settings)));
  }
  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === 'rejected') console.error('Alert failed', r.reason);
}

async function showNotification(
  finished: Phase,
  next: TimerState,
  planLine: string | null,
  extended: boolean,
  offerKeepGoing: boolean,
): Promise<void> {
  const title = extended
    ? 'Extra time is up'
    : finished === 'work'
      ? 'Focus session complete'
      : 'Break is over';
  const nextLine =
    next.status === 'running'
      ? `${PHASE_LABELS[next.phase]} started.`
      : `Ready for your ${PHASE_LABELS[next.phase].toLowerCase()}.`;
  const message = planLine ? `${planLine} ${nextLine}` : nextLine;
  await chrome.notifications.clear(NOTIFICATION_ID);
  await chrome.notifications.create(NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title,
    message,
    buttons: notificationButtons(next, offerKeepGoing).map((b) => ({
      title:
        b === 'start'
          ? `Start ${PHASE_LABELS[next.phase].toLowerCase()}`
          : `Keep going (+${KEEP_GOING_MINUTES} min)`,
    })),
    priority: 2,
    requireInteraction: next.status !== 'running',
  });
}

type NotificationButton = 'start' | 'keepGoing';

/** "Start" when the next phase waits for you, and "Keep going" when it's offered. */
function notificationButtons(next: TimerState, offerKeepGoing: boolean): NotificationButton[] {
  const buttons: NotificationButton[] = [];
  if (next.status !== 'running') buttons.push('start');
  if (offerKeepGoing) buttons.push('keepGoing');
  return buttons;
}

/** Finishes the current phase if its end time has passed. */
function completeIfDue(): Promise<TimerState> {
  return serialized(async () => {
    const [state, settings] = await Promise.all([loadState(), loadSettings()]);
    const now = Date.now();
    if (state.status !== 'running' || state.endTime === null || state.endTime > now) {
      await updateBadge(state);
      return state;
    }
    let next = advance(state, settings, now, true, state.endTime);
    // Focus that starts on its own while nobody is at the computer waits for them.
    if (settings.awayCheck && next.phase === 'work' && next.status === 'running') {
      if ((await chrome.idle.queryState(AWAY_MS / 1000)) !== 'active') {
        next = stepAway(next, settings, now, now);
      }
    }
    if (state.phase === 'work') {
      // Read before the state is saved, so a first history still sees today's old tally.
      const history = await loadHistory();
      const minutes = focusMinutes(state, settings);
      await saveHistory(
        state.extending
          ? addFocusMinutes(history, state.endTime, minutes)
          : recordPomodoro(history, state.endTime, minutes),
      );
    }
    await commit(next);
    await updateBadge(next, true);
    await alertPhaseComplete(state.phase, next, settings, state.extending === true);
    return next;
  });
}

/** Minutes of a finished focus session, which a "Just start" one makes shorter. */
function focusMinutes(state: TimerState, settings: Settings): number {
  return Math.round(phaseLengthMs(state, settings) / 60_000);
}

function runCommand(cmd: Command): Promise<TimerState> {
  // Whatever you just did answers "still paused?" and "welcome back".
  void chrome.notifications.clear(PAUSE_NOTIFICATION_ID);
  void chrome.notifications.clear(AWAY_NOTIFICATION_ID);
  return serialized(async () => {
    const [stored, settings] = await Promise.all([loadState(), loadSettings()]);
    const now = Date.now();
    const state = rollDay(stored, now);
    switch (cmd.command) {
      case 'start':
        return commit(settleStart(withFirstStep(state, cmd.step), settings, now));
      case 'justStart':
        return commit(justStart(state, settings, now));
      case 'keepGoing':
        await chrome.notifications.clear(NOTIFICATION_ID);
        return commit(keepGoing(state, settings, now));
      case 'skipSettle':
        return commit(skipSettle(state, now));
      case 'wasWorking':
        return commit(wasWorking(state, now));
      case 'pause':
        return commit(pause(state, now));
      case 'reset':
        return commit(reset(state, settings));
      case 'setPhase':
        return commit(setPhase(state, cmd.phase, settings));
      case 'skip':
        await chrome.notifications.clear(NOTIFICATION_ID);
        return commit(advance(state, settings, now, false));
    }
  });
}

chrome.runtime.onMessage.addListener((message: CommandMessage, _sender, sendResponse) => {
  if (message?.type !== 'command') return false;
  runCommand(message)
    .then((state) => sendResponse({ ok: true, state } satisfies CommandResponse))
    .catch((err: unknown) =>
      sendResponse({ ok: false, error: String(err) } satisfies CommandResponse),
    );
  return true; // keep the channel open for the async response
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PHASE_END_ALARM || alarm.name === BADGE_ALARM) void completeIfDue();
  if (alarm.name === HEADS_UP_ALARM) void headsUp();
  if (alarm.name === PAUSE_NUDGE_ALARM) void pauseNudge();
});

chrome.notifications.onButtonClicked.addListener((id, index) => {
  if (id === AWAY_NOTIFICATION_ID) {
    void runCommand({ command: index === 0 ? 'start' : 'wasWorking' });
    return;
  }
  if (id === PAUSE_NOTIFICATION_ID) {
    void runCommand({ command: index === 0 ? 'start' : 'reset' });
    return;
  }
  if (id !== NOTIFICATION_ID) return;
  void chrome.notifications.clear(id);
  void (async () => {
    // The buttons were laid out from this same state, so the index lines up.
    const [state, settings] = await Promise.all([loadState(), loadSettings()]);
    const button = notificationButtons(state, canKeepGoing(state, settings))[index];
    if (button) await runCommand({ command: button === 'start' ? 'start' : 'keepGoing' });
  })();
});

chrome.notifications.onClicked.addListener((id) => {
  if (id === NOTIFICATION_ID || id === PAUSE_NOTIFICATION_ID || id === AWAY_NOTIFICATION_ID) {
    void chrome.notifications.clear(id);
  }
});

// When durations change in Options, an idle timer should show the new length.
// Blocker changes take effect right away, even mid-session.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes['settings']) return;
  void serialized(async () => {
    const [state, settings] = await Promise.all([loadState(), loadSettings()]);
    await syncMenus(settings);
    if (state.status === 'idle') await commit(reset(state, settings));
    else {
      await syncBlocking(state, settings);
      await syncAlarms(state, settings);
      await syncFocusSound(state, settings);
      await updateBadge(state);
    }
    // Turning the blocker off hands back its site access.
    if (!settings.blockSites && (await chrome.permissions.contains(BLOCKER_PERMISSIONS))) {
      await chrome.permissions.remove(BLOCKER_PERMISSIONS);
    }
  });
});

// The settings switch asks for site access. Chrome may close the popup while
// its prompt is up, so the worker finishes turning the blocker on.
chrome.permissions.onAdded.addListener(() => {
  void serialized(async () => {
    if (!(await chrome.permissions.contains(BLOCKER_PERMISSIONS))) return;
    const [state, settings] = await Promise.all([loadState(), loadSettings()]);
    if (!settings.blockSites) {
      const blockedSites = settings.blockedSites.length ? settings.blockedSites : SUGGESTED_SITES;
      await saveSettings({ ...settings, blockSites: true, blockedSites });
    }
    await syncBlocking(state);
    await syncMenus();
  });
});

// Access removed in chrome://extensions turns the blocker off too.
chrome.permissions.onRemoved.addListener(() => {
  void serialized(async () => {
    if (await chrome.permissions.contains(BLOCKER_PERMISSIONS)) return;
    const settings = await loadSettings();
    if (settings.blockSites) await saveSettings({ ...settings, blockSites: false });
  });
});

// Right-click shortcuts. Each item is there only while its switch, and the
// feature it feeds, are on.
const MENU_PARK = 'park-thought';
const MENU_BLOCK = 'block-site';

async function syncMenus(settings?: Settings): Promise<void> {
  settings ??= await loadSettings();
  await chrome.contextMenus.removeAll();
  if (!settings.rightClick) return;
  // Creating reports problems through lastError, so read it to keep the console quiet.
  const quiet = () => void chrome.runtime.lastError;
  if (settings.parkingLot) {
    chrome.contextMenus.create(
      { id: MENU_PARK, title: 'Park this thought', contexts: ['selection'] },
      quiet,
    );
  }
  if (settings.blockSites && (await chrome.permissions.contains(BLOCKER_PERMISSIONS))) {
    chrome.contextMenus.create(
      {
        id: MENU_BLOCK,
        title: 'Block this site during focus',
        contexts: ['page'],
        documentUrlPatterns: ['http://*/*', 'https://*/*'],
      },
      quiet,
    );
  }
}

/** A quick check mark on the toolbar icon, so a right-click shortcut shows it worked. */
async function confirmOnBadge(): Promise<void> {
  if ((await chrome.action.getBadgeText({})) === '✓') return;
  const [state, settings] = await Promise.all([loadState(), loadSettings()]);
  const colors = settings.colorSafe ? SAFE_BADGE_COLORS : BADGE_COLORS;
  await chrome.action.setBadgeBackgroundColor({ color: colors[state.phase] });
  await chrome.action.setBadgeText({ text: '✓' });
  setTimeout(() => void serialized(async () => updateBadge(await loadState())), 1500);
}

chrome.contextMenus.onClicked.addListener((info) => {
  void serialized(async () => {
    const settings = await loadSettings();
    if (!settings.rightClick) return;
    if (info.menuItemId === MENU_PARK && settings.parkingLot && info.selectionText) {
      const lot = await loadParkingLot();
      await saveParkingLot(parkThought(lot, info.selectionText, Date.now(), crypto.randomUUID()));
      await confirmOnBadge();
    } else if (info.menuItemId === MENU_BLOCK && settings.blockSites && info.pageUrl) {
      const site = normalizeSite(info.pageUrl);
      if (!site) return;
      const blockedSites = addSite(settings.blockedSites, site);
      // Saving starts blocking it right away if focus is running (see storage.onChanged).
      if (blockedSites !== settings.blockedSites) {
        await saveSettings({ ...settings, blockedSites: [...blockedSites] });
      }
      await confirmOnBadge();
    }
  });
});

// The away check: Chrome reports "idle" after this long without keyboard or
// mouse input, and "locked" as soon as the screen locks.
chrome.idle.setDetectionInterval(AWAY_MS / 1000);

chrome.idle.onStateChanged.addListener((idle) => {
  void serialized(async () => {
    const [state, settings] = await Promise.all([loadState(), loadSettings()]);
    const now = Date.now();
    if (idle === 'active') {
      if (state.status === 'paused' && state.away) await welcomeBack(state);
      return;
    }
    // "idle" arrives once the computer has sat untouched for the whole interval.
    const leftAt = idle === 'idle' ? now - AWAY_MS : now;
    const next = stepAway(state, settings, leftAt, now);
    if (next !== state) await commit(next);
  });
});

/** Back at the computer after an "away" pause: resume, or count the time as focus. */
async function welcomeBack(state: TimerState): Promise<void> {
  const awayMinutes = Math.max(
    1,
    Math.round((Date.now() - (state.pausedAt ?? Date.now())) / 60_000),
  );
  await chrome.notifications.clear(PAUSE_NOTIFICATION_ID);
  await chrome.notifications.create(AWAY_NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'Welcome back',
    message: `Focus paused when you stepped away ${awayMinutes} min ago.`,
    buttons: [{ title: 'Resume' }, { title: 'I was working' }],
    silent: true,
    priority: 0,
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void serialized(async () => {
    await syncMenus();
    return commit(await loadState());
  });
});

// The browser may have been closed when a phase ended; catch up on launch.
// A focus session still running picks its sound back up.
chrome.runtime.onStartup.addListener(() => {
  void serialized(() => syncMenus());
  void completeIfDue().then(() => serialized(async () => syncFocusSound(await loadState())));
});
