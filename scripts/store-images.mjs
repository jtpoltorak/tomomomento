// Renders the Chrome Web Store screenshots and promo tiles into store/images/
// from the built extension, using Playwright's Chromium. Only needed when the UI changes:
//   npm run build && npm i --no-save playwright && npx playwright install chromium
//   node scripts/store-images.mjs
// Set CHROMIUM_PATH to use a Chromium that's already installed.
import { cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

// A headless browser can't click "Allow" on the site blocker's permission prompt,
// so load a copy of dist/ with the blocker's optional permissions made required.
const dist = await mkdtemp(join(tmpdir(), 'tomomomento-'));
await cp('dist', dist, { recursive: true });
const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
manifest.permissions.push(...manifest.optional_permissions);
manifest.host_permissions = manifest.optional_host_permissions;
delete manifest.optional_permissions;
delete manifest.optional_host_permissions;
await writeFile(join(dist, 'manifest.json'), JSON.stringify(manifest));

const out = 'store/images';
const executablePath = process.env.CHROMIUM_PATH || undefined;
await mkdir(out, { recursive: true });

const ctx = await chromium.launchPersistentContext('', {
  executablePath,
  headless: true,
  deviceScaleFactor: 2,
  colorScheme: 'light',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const base = `chrome-extension://${new URL(worker.url()).host}`;

const page = await ctx.newPage();
await page.setViewportSize({ width: 480, height: 600 });

/** Opens the popup at `hash` and returns a 2x PNG of it as a data URL. */
async function popup(hash = '', before = async () => {}) {
  await page.goto('about:blank');
  await page.goto(`${base}/index.html${hash}`);
  await page.waitForTimeout(400);
  await before();
  await page.mouse.move(0, 599); // no hover states in the shot
  await page.waitForTimeout(400);
  const png = await page.locator('body').screenshot();
  return `data:image/png;base64,${png.toString('base64')}`;
}
const send = (message) =>
  page.evaluate((m) => chrome.runtime.sendMessage({ type: 'command', ...m }), message);

// Hide the "get an alert?" hint so the shots stay uncluttered, and set up a short site list.
await page.goto(`${base}/index.html`);
await page.evaluate(async () => {
  await chrome.storage.local.set({ alertHintDismissed: true });
  const { settings } = await chrome.storage.sync.get('settings');
  await chrome.storage.sync.set({
    settings: {
      ...settings,
      soundEnabled: true,
      notificationsEnabled: true,
      blockSites: true,
      blockedSites: ['youtube.com', 'reddit.com', 'x.com'],
    },
  });
});

/** Merges `patch` into the stored settings. */
const setSettings = (patch) =>
  page.evaluate(async (p) => {
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...settings, ...p } });
  }, patch);

// A believable few months of history for Stats, and a plan for today with two
// pomodoros done, so the plan strip and "Now:" label show on the focus shot.
await page.evaluate(async () => {
  const key = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const history = {};
  const today = new Date();
  for (let i = 1; i < 112; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const n = weekend
      ? rand() < 0.7
        ? 0
        : 1 + Math.floor(rand() * 3)
      : rand() < 0.15
        ? 0
        : 2 + Math.floor(rand() * 7);
    if (n) history[key(d)] = { pomodoros: n, focusMinutes: n * 25 };
  }
  // The last week, oldest first, ending with today.
  [6, 4, 7, 5, 0, 1, 2].forEach((n, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + i);
    if (n) history[key(d)] = { pomodoros: n, focusMinutes: n * 25 };
    else delete history[key(d)];
  });
  const { state } = await chrome.storage.local.get('state');
  await chrome.storage.local.set({
    history,
    state: { ...state, completedToday: 2, completedInCycle: 2, todayKey: key(today) },
    plan: {
      plan: {
        date: key(today),
        pomodoros: 6,
        labels: ['Clear inbox', 'Email replies', 'Draft report', 'Draft report', '', ''],
      },
      lastCount: 6,
      skippedOn: null,
    },
    // A few thoughts parked during focus, for the parking lot and break shots.
    parkingLot: {
      thoughts: [
        { id: '1', text: 'Call the dentist about Thursday', at: Date.now() - 3000 },
        { id: '2', text: 'Look up that song from the coffee shop', at: Date.now() - 2000 },
        { id: '3', text: 'Buy milk', at: Date.now() - 1000 },
      ],
      seenAt: 0,
    },
  });
});
await setSettings({ planEnabled: true, parkingLot: true });

const parking = await popup('', async () => {
  await page.locator('[data-view="parking"]').click();
  await page.waitForSelector('app-parking-view');
  await page.fill('#thought', 'Email Sam the photos');
  await page.keyboard.press('Enter');
  await page.locator('#thought').blur();
});
// Opening the lot marked everything seen; un-see it so the break card shows.
await page.evaluate(async () => {
  const { parkingLot } = await chrome.storage.local.get('parkingLot');
  await chrome.storage.local.set({ parkingLot: { ...parkingLot, seenAt: 0 } });
});

const focus = await popup('', async () => {
  await send({ command: 'start' });
  await page.waitForTimeout(61_000); // let a minute pass so the bar shows progress
});
await send({ command: 'reset' });
// Stats in the dark theme, to show it off.
await setSettings({ theme: 'dark' });
const stats = await popup('', async () => {
  await page.getByRole('button', { name: 'Stats' }).click();
  await page.waitForSelector('app-stats-view');
});
await setSettings({ theme: 'system' });
// The break, with a break idea and the parked thoughts card, and no plan, to keep it calm.
await setSettings({ breakIdeas: true, planEnabled: false });
const brk = await popup('', async () => {
  await send({ command: 'setPhase', phase: 'shortBreak' });
  await send({ command: 'start' });
  await page.waitForTimeout(1500);
});
await setSettings({ breakIdeas: false });

// The blocked page, during a focus session.
await send({ command: 'setPhase', phase: 'work' });
await send({ command: 'start' });
const blockedPage = await ctx.newPage();
await blockedPage.setViewportSize({ width: 640, height: 520 });
await blockedPage.goto(`${base}/blocked.html#https://www.youtube.com/`);
await blockedPage.waitForTimeout(800);
const blocked = `data:image/png;base64,${(await blockedPage.screenshot()).toString('base64')}`;

// Compose the popup shots onto branded canvases.
const icon = `data:image/svg+xml;base64,${(await readFile('assets/icon.svg')).toString('base64')}`;
const font = `data:font/woff2;base64,${(await readFile('public/fonts/rubik-latin.woff2')).toString('base64')}`;
const canvas = await ctx.newPage();
const css = `
  @font-face { font-family: Rubik; src: url(${font}) format('woff2'); font-weight: 300 900; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Rubik, sans-serif; color: #1f2328; }
  .frame { position: relative; overflow: hidden; display: flex; align-items: center; }
  .shot { width: 480px; max-height: 720px; object-fit: cover; object-position: top; border-radius: 14px; box-shadow: 0 18px 50px rgb(0 0 0 / 0.18), 0 2px 8px rgb(0 0 0 / 0.08); background: #fff; }
  h1 { margin: 0 0 16px; font-size: 52px; line-height: 1.1; font-weight: 700; letter-spacing: -0.01em; }
  .badge { display: grid; place-items: center; flex: none; border-radius: 28%; background: #fff; box-shadow: 0 8px 24px rgb(0 0 0 / 0.2); }
  p { margin: 0; font-size: 26px; line-height: 1.4; color: #57606a; }
`;
async function render(path, width, height, html) {
  await canvas.setViewportSize({ width, height });
  await canvas.setContent(`<style>${css}</style>${html}`);
  await canvas.evaluate(() => document.fonts.ready);
  await canvas.screenshot({ path, scale: 'css' });
}
const shot = (title, text, img, tint, width = 440) =>
  `<div class="frame" style="width:1280px;height:800px;background:linear-gradient(135deg,${tint} 0%,#ffffff 70%);padding:0 90px;gap:80px">
    <img class="shot" src="${img}" style="width:${width}px">
    <div style="max-width:560px"><h1>${title}</h1><p>${text}</p></div>
  </div>`;

await render(
  `${out}/screenshot-1-focus.png`,
  1280,
  800,
  shot(
    'One click to focus',
    'Start a 25-minute focus session. The timer keeps running, and the toolbar icon counts down, even with the popup closed.',
    focus,
    '#ffe8dc',
  ),
);
await render(
  `${out}/screenshot-2-parking.png`,
  1280,
  800,
  shot(
    'Park stray thoughts',
    'A thought pops up mid-focus? Jot it in the parking lot and get back to work. Your next break reminds you what you parked.',
    parking,
    '#ffe8dc',
  ),
);
await render(
  `${out}/screenshot-3-stats.png`,
  1280,
  800,
  shot(
    'See your progress',
    'Your totals for today, the week, the month, and all time, with a calendar of the last 16 weeks. It all stays on your device: no account, no tracking.',
    stats,
    '#e4e6f0',
    340,
  ),
);
await render(
  `${out}/screenshot-4-break.png`,
  1280,
  800,
  shot(
    'Breaks that actually happen',
    'Short breaks between sessions and a long one after four. Get a gentle sound or notification when time’s up, and an idea for something screen-free to do.',
    brk,
    '#dcf5e1',
  ),
);
await render(
  `${out}/screenshot-5-blocker.png`,
  1280,
  800,
  `<div class="frame" style="width:1280px;height:800px;background:linear-gradient(135deg,#ffe8dc 0%,#ffffff 70%);padding:0 90px;gap:72px">
    <div style="max-width:420px"><h1>Distractions on pause</h1><p>Sites you choose show a “stay focused” page during focus sessions, with the time left. Breaks unblock them.</p></div>
    <div class="shot" style="width:640px;max-height:none;overflow:hidden">
      <div style="height:40px;background:#eef1f4;display:flex;align-items:center;gap:8px;padding:0 16px">
        <span style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></span>
        <span style="width:12px;height:12px;border-radius:50%;background:#febc2e"></span>
        <span style="width:12px;height:12px;border-radius:50%;background:#28c840"></span>
        <span style="margin-left:16px;flex:1;height:24px;border-radius:12px;background:#fff;font-size:14px;line-height:24px;padding:0 12px;color:#57606a">youtube.com</span>
      </div>
      <img src="${blocked}" style="display:block;width:640px">
    </div>
  </div>`,
);
await render(
  `${out}/promo-small.png`,
  440,
  280,
  `<div class="frame" style="width:440px;height:280px;background:linear-gradient(135deg,#ff7a45,#d9480f);justify-content:center;gap:16px">
    <div class="badge" style="width:100px;height:100px"><img src="${icon}" style="width:76px;height:76px"></div>
    <div style="color:#fff;font-size:36px;font-weight:700">Tomomomento</div>
  </div>`,
);
await render(
  `${out}/promo-marquee.png`,
  1400,
  560,
  `<div class="frame" style="width:1400px;height:560px;background:linear-gradient(135deg,#ff7a45,#d9480f);padding:0 120px;gap:80px">
    <div style="flex:1;color:#fff">
      <div class="badge" style="width:112px;height:112px;margin-bottom:28px"><img src="${icon}" style="width:84px;height:84px"></div>
      <div style="font-size:72px;font-weight:700;line-height:1">Tomomomento</div>
      <div style="font-size:32px;margin-top:16px;opacity:.92">A simple, free focus timer</div>
    </div>
    <img class="shot" src="${focus}" style="width:340px;align-self:flex-end;margin-bottom:-60px">
  </div>`,
);

await ctx.close();
console.log(`Wrote store images to ${out}/`);
