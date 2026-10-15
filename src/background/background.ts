// Background service worker: the single source of truth for the timer.
//
// MV3 service workers are shut down when idle, so nothing here relies on
// in-memory state or setInterval. The timer is stored as an absolute end time
// in chrome.storage, and a chrome.alarms alarm wakes the worker when it is due.

import type {
  Command,
  CommandMessage,
  CommandResponse,
  PlaySoundMessage,
} from '../shared/messages';
import { BLOCKER_PERMISSIONS, hostMatches, shouldBlock, SUGGESTED_SITES } from '../shared/blocker';
import { planDoneMessage } from '../shared/plan';
import { recordPomodoro } from '../shared/stats';
import {
  loadHistory,
  loadPlan,
  loadSettings,
  loadState,
  saveHistory,
  saveSettings,
  saveState,
} from '../shared/storage';
import {
  advance,
  justStart,
  pause,
  phaseLengthMs,
  PHASE_LABELS,
  remainingMs,
  reset,
  rollDay,
  setPhase,
  start,
  type Phase,
  type Settings,
  type TimerState,
} from '../shared/timer';

const PHASE_END_ALARM = 'phase-end';
const BADGE_ALARM = 'badge-refresh';
const NOTIFICATION_ID = 'phase-complete';

const BADGE_COLORS: Record<Phase, string> = {
  work: '#d9480f',
  shortBreak: '#2f9e44',
  longBreak: '#1971c2',
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

async function syncAlarms(state: TimerState): Promise<void> {
  if (state.status === 'running' && state.endTime !== null) {
    await chrome.alarms.create(PHASE_END_ALARM, { when: state.endTime });
    // 0.5 minutes is the shortest period Chrome allows.
    await chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 0.5 });
  } else {
    await chrome.alarms.clear(PHASE_END_ALARM);
    await chrome.alarms.clear(BADGE_ALARM);
  }
}

async function updateBadge(state: TimerState, justFinished = false): Promise<void> {
  if (state.status === 'idle' && justFinished) {
    // A quiet "time's up" cue for people who leave sounds and notifications off.
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS[state.phase] });
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
  const color = state.status === 'paused' ? PAUSED_BADGE_COLOR : BADGE_COLORS[state.phase];
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  await chrome.action.setBadgeText({ text: `${minutesLeft}m` });
  const verb = state.status === 'paused' ? 'paused' : 'running';
  await chrome.action.setTitle({
    title: `Tomomomento: ${PHASE_LABELS[state.phase]} ${verb}, ${minutesLeft} min left`,
  });
}

const OFFSCREEN_URL = 'offscreen.html';

async function playAlertSound(settings: Settings): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length === 0) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Play the alert sound the user turned on for when a timer ends.',
    });
  }
  const message: PlaySoundMessage = {
    type: 'play-sound',
    target: 'offscreen',
    sound: settings.sound,
    volume: settings.volume,
  };
  await chrome.runtime.sendMessage(message);
}

async function alertPhaseComplete(
  finished: Phase,
  next: TimerState,
  settings: Settings,
): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (settings.soundEnabled) tasks.push(playAlertSound(settings));
  if (settings.notificationsEnabled) {
    const planLine = finished === 'work' ? planDoneMessage(await loadPlan(), settings, next) : null;
    tasks.push(showNotification(finished, next, planLine));
  }
  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === 'rejected') console.error('Alert failed', r.reason);
}

async function showNotification(
  finished: Phase,
  next: TimerState,
  planLine: string | null,
): Promise<void> {
  const title = finished === 'work' ? 'Focus session complete' : 'Break is over';
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
    buttons:
      next.status === 'running'
        ? []
        : [{ title: `Start ${PHASE_LABELS[next.phase].toLowerCase()}` }],
    priority: 2,
    requireInteraction: next.status !== 'running',
  });
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
    const next = advance(state, settings, now, true, state.endTime);
    if (state.phase === 'work') {
      // Read before the state is saved, so a first history still sees today's old tally.
      const history = await loadHistory();
      await saveHistory(recordPomodoro(history, state.endTime, focusMinutes(state, settings)));
    }
    await commit(next);
    await updateBadge(next, true);
    await alertPhaseComplete(state.phase, next, settings);
    return next;
  });
}

/** Minutes of a finished focus session, which a "Just start" one makes shorter. */
function focusMinutes(state: TimerState, settings: Settings): number {
  return Math.round(phaseLengthMs(state, settings) / 60_000);
}

function runCommand(cmd: Command): Promise<TimerState> {
  return serialized(async () => {
    const [stored, settings] = await Promise.all([loadState(), loadSettings()]);
    const now = Date.now();
    const state = rollDay(stored, now);
    switch (cmd.command) {
      case 'start':
        return commit(start(state, now));
      case 'justStart':
        return commit(justStart(state, settings, now));
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
});

chrome.notifications.onButtonClicked.addListener((id) => {
  if (id !== NOTIFICATION_ID) return;
  void chrome.notifications.clear(id);
  void runCommand({ command: 'start' });
});

chrome.notifications.onClicked.addListener((id) => {
  if (id === NOTIFICATION_ID) void chrome.notifications.clear(id);
});

// When durations change in Options, an idle timer should show the new length.
// Blocker changes take effect right away, even mid-session.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes['settings']) return;
  void serialized(async () => {
    const [state, settings] = await Promise.all([loadState(), loadSettings()]);
    if (state.status === 'idle') await commit(reset(state, settings));
    else await syncBlocking(state, settings);
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

chrome.runtime.onInstalled.addListener(() => {
  void serialized(async () => commit(await loadState()));
});

// The browser may have been closed when a phase ended; catch up on launch.
chrome.runtime.onStartup.addListener(() => {
  void completeIfDue();
});
