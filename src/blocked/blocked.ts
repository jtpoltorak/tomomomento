// The "stay focused" page the site blocker redirects to. The blocked URL
// follows the # so the page can offer a way back once the session ends.

import { shouldBlock } from '../shared/blocker';
import { loadSettings, loadState } from '../shared/storage';
import { formatClock, remainingMs, type TimerState } from '../shared/timer';
import { a11yAttributes } from '../popup/app/theme';

const blockedUrl = parseBlockedUrl(location.hash.slice(1));
const site = blockedUrl?.hostname.replace(/^www\./, '') ?? 'This site';

const $ = (id: string) => document.getElementById(id)!;
const title = $('title');
const message = $('message');
const clock = $('clock');
const continueLink = $('continue') as HTMLAnchorElement;

let tick: ReturnType<typeof setInterval> | undefined;

function parseBlockedUrl(text: string): URL | null {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function setMessage(before: string, after: string): void {
  const name = document.createElement('span');
  name.className = 'site';
  name.textContent = site;
  message.replaceChildren(before, name, after);
}

function render(state: TimerState, blocking: boolean): void {
  clearInterval(tick);
  document.title = `${site} is ${blocking ? 'blocked' : 'unblocked'} · Tomomomento`;
  if (blocking) {
    title.textContent = 'Stay focused';
    setMessage('', ' is blocked until your focus session ends.');
    const update = () => (clock.textContent = formatClock(remainingMs(state, Date.now())));
    update();
    tick = setInterval(update, 250);
    continueLink.hidden = true;
    return;
  }
  title.textContent =
    state.phase !== 'work'
      ? 'Enjoy your break'
      : state.status === 'paused'
        ? 'Focus paused'
        : 'No focus session running';
  setMessage('', ' is unblocked for now.');
  clock.textContent = '';
  if (blockedUrl) {
    continueLink.href = blockedUrl.href;
    continueLink.textContent = `Continue to ${site}`;
    continueLink.hidden = false;
  }
}

async function refresh(): Promise<void> {
  const [state, settings] = await Promise.all([loadState(), loadSettings()]);
  // Follow the Light / Dark / System choice from the popup's Settings.
  if (settings.theme === 'system') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = settings.theme;
  // And the accessibility choices, the same way the popup applies them.
  for (const [key, value] of Object.entries(a11yAttributes(settings))) {
    if (value === undefined) delete document.documentElement.dataset[key];
    else document.documentElement.dataset[key] = value;
  }
  render(state, shouldBlock(state, settings));
}

chrome.storage.onChanged.addListener(() => void refresh());
void refresh();
