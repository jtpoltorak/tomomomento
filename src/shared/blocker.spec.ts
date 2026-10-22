import {
  addSite,
  hostMatches,
  MAX_BLOCKED_SITES,
  normalizeSite,
  sanitizeSites,
  shouldBlock,
} from './blocker';
import { DEFAULT_SETTINGS, initialState, start } from './timer';

describe('site blocker', () => {
  it('normalizeSite turns typed URLs into bare domains', () => {
    expect(normalizeSite('youtube.com')).toBe('youtube.com');
    expect(normalizeSite('  https://www.YouTube.com/watch?v=1 ')).toBe('youtube.com');
    expect(normalizeSite('news.ycombinator.com/item')).toBe('news.ycombinator.com');
    expect(normalizeSite('reddit.com.')).toBe('reddit.com');
  });

  it('normalizeSite rejects things that are not domains', () => {
    expect(normalizeSite('')).toBeNull();
    expect(normalizeSite('localhost')).toBeNull();
    expect(normalizeSite('not a site')).toBeNull();
    expect(normalizeSite('-bad-.com')).toBeNull();
  });

  it('sanitizeSites drops junk and duplicates', () => {
    expect(sanitizeSites(['x.com', 'www.x.com', 'nope', 3, 'Reddit.com'])).toEqual([
      'x.com',
      'reddit.com',
    ]);
    expect(sanitizeSites('x.com')).toEqual([]);
  });

  it('hostMatches covers subdomains but not lookalikes', () => {
    expect(hostMatches('youtube.com', 'youtube.com')).toBe(true);
    expect(hostMatches('m.youtube.com', 'youtube.com')).toBe(true);
    expect(hostMatches('notyoutube.com', 'youtube.com')).toBe(false);
  });

  it('only blocks while a focus session is running', () => {
    const now = Date.now();
    const settings = { ...DEFAULT_SETTINGS, blockSites: true, blockedSites: ['x.com'] };
    const idle = initialState(settings, now);
    const running = start(idle, now);
    expect(shouldBlock(idle, settings)).toBe(false);
    expect(shouldBlock(running, settings)).toBe(true);
    expect(shouldBlock({ ...running, phase: 'shortBreak' }, settings)).toBe(false);
    expect(shouldBlock(running, { ...settings, blockSites: false })).toBe(false);
    expect(shouldBlock(running, { ...settings, blockedSites: [] })).toBe(false);
  });
});

describe('addSite', () => {
  it('adds a new site at the end', () => {
    expect(addSite(['youtube.com'], 'reddit.com')).toEqual(['youtube.com', 'reddit.com']);
  });

  it('leaves the list alone when the site is already covered or the list is full', () => {
    const sites = ['youtube.com'];
    expect(addSite(sites, 'youtube.com')).toBe(sites);
    expect(addSite(sites, 'music.youtube.com')).toBe(sites);
    const full = Array.from({ length: MAX_BLOCKED_SITES }, (_, i) => `site${i}.com`);
    expect(addSite(full, 'reddit.com')).toBe(full);
  });
});
