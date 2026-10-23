// Renders assets/icon.svg to the PNG sizes Chrome and the web app need, using
// Playwright's Chromium. Only needed when the icon changes:
//   npm i --no-save playwright && npx playwright install chromium && node scripts/icons.mjs
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const svg = await readFile('assets/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(`<body style="margin:0">${sized}</body>`);
  await page.screenshot({ path: `public/icons/icon-${size}.png`, omitBackground: true });
}

// The web app's install icons. "Maskable" and Apple icons get cropped to a
// shape and can't be transparent, so they sit on white with room to spare.
const render = async (file, size, { padded = false } = {}) => {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = padded ? Math.round(size * 0.7) : size;
  const sized = svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `);
  const bg = padded ? 'background:#fff;' : '';
  await page.setContent(
    `<body style="margin:0;${bg}display:grid;place-items:center;height:${size}px">${sized}</body>`,
  );
  await page.screenshot({ path: `src/web/public/icons/${file}`, omitBackground: !padded });
};
await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('icon-maskable-512.png', 512, { padded: true });
await render('apple-touch-icon.png', 180, { padded: true });

// The Edge Add-ons store logo (300x300).
{
  const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
  const sized = svg.replace('<svg ', '<svg width="300" height="300" ');
  await page.setContent(`<body style="margin:0">${sized}</body>`);
  await page.screenshot({ path: 'store/images/logo-300.png', omitBackground: true });
}
await browser.close();
