// Pure site-blocker helpers shared by the background worker, popup, and blocked page.
// Nothing in this file calls `chrome.*`, so it can be unit tested in Node.

import type { Settings, TimerState } from './timer';

/** Suggested sites, filled in the first time the blocker is turned on. */
export const SUGGESTED_SITES = [
  'youtube.com',
  'reddit.com',
  'x.com',
  'facebook.com',
  'instagram.com',
];

export const MAX_BLOCKED_SITES = 100;

/**
 * The blocker needs to redirect pages on any site, so it asks for these
 * optional permissions only when the user turns it on. Neither is requested
 * at install time.
 */
export const BLOCKER_PERMISSIONS: chrome.permissions.Permissions = {
  permissions: ['declarativeNetRequestWithHostAccess'],
  origins: ['<all_urls>'],
};

/**
 * Turns whatever the user typed ("https://www.YouTube.com/watch?v=1") into a
 * bare domain ("youtube.com"), or null if it isn't one.
 */
export function normalizeSite(input: string): string | null {
  let text = input.trim().toLowerCase();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(text)) text = `http://${text}`;
  let host: string;
  try {
    host = new URL(text).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  const labels = host.split('.');
  if (labels.length < 2 || !labels.every((l) => label.test(l))) return null;
  return host;
}

/**
 * The list with `site` added at the end, or the same list when it's already
 * there (or covered by a site it's part of) or the list is full.
 */
export function addSite(sites: readonly string[], site: string): readonly string[] {
  if (sites.some((s) => hostMatches(site, s)) || sites.length >= MAX_BLOCKED_SITES) return sites;
  return [...sites, site];
}

/** Cleans a stored site list: valid, unique domains, capped in length. */
export function sanitizeSites(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const sites = input
    .map((s) => (typeof s === 'string' ? normalizeSite(s) : null))
    .filter((s): s is string => s !== null);
  return [...new Set(sites)].slice(0, MAX_BLOCKED_SITES);
}

/** True when `hostname` is `site` or one of its subdomains. */
export function hostMatches(hostname: string, site: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === site || host.endsWith(`.${site}`);
}

/** The blocker only bites while a focus session is actually counting down. */
export function shouldBlock(state: TimerState, settings: Settings): boolean {
  return (
    settings.blockSites &&
    settings.blockedSites.length > 0 &&
    state.phase === 'work' &&
    state.status === 'running'
  );
}
