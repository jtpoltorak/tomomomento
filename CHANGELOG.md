# Changelog

What changed in each release of the Chrome extension. The web app at
https://tomomomento.com updates from `main` as changes land, so it gets each of
these first.

## Unreleased

### New

- **Stats:** a chart button next to Help opens your pomodoro totals for today,
  the last 7 days, this month, and all time, a bar chart of the last 7 days, and
  a 16-week calendar heat map. History starts with this update (today's count
  carries over), stays on your device, and can be cleared with Reset stats.

## 1.1.0 (2026-10-09)

### New

- **Theme setting:** choose light, dark, or follow your system (Settings > Appearance).
- **Optional quotes:** a short quote on the timer screen, about focus and effort
  during focus sessions and about rest on breaks. Off by default; turn it on in
  Settings > Appearance.
- **Progress bar:** a bar under the clock that empties as time runs out, in place
  of the ring.
- **Bigger, easier-to-read layout:** larger text and controls throughout.
- **Help tabs:** Help is split into Basics, Tips, Technique, and About.

### Accessibility

- Meets WCAG 2.2 AA: stronger contrast in both themes, clearer focus outlines,
  full keyboard and screen reader support, and respect for reduced-motion settings.

### Fixes

- The "done today" count now resets at midnight. Before, yesterday's count could
  show until you started a timer.
- The long-break dots reset on a new day too.
- A focus session that ends while Chrome is closed counts toward the day it ended,
  not the day you reopen Chrome.

### Web app only

- An Install button in the header installs Tomomomento as an app.

## 1.0.0 (2026-10-07)

First release on the Chrome Web Store.
