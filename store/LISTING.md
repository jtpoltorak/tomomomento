# Chrome Web Store listing

Everything to paste into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
for Tomomomento 1.3.0 (what changed: [CHANGELOG.md](../CHANGELOG.md)). Images are in [`images/`](images); regenerate them with
`node scripts/store-images.mjs` after UI changes.

## Store listing tab

**Title** (from the manifest): Tomomomento: Focus Timer

**Summary** (from the manifest description, 132 characters max):

> A simple, customizable focus timer: focus sessions, short and long breaks, and optional sound and notification alerts.

**Category:** Productivity › Workflow & Planning

**Language:** English (United States)

**Description:**

```text
Tomomomento is a simple, free focus timer. Work in 25-minute focus sessions with short breaks in between and a longer break after every four, the rhythm made popular by the Pomodoro Technique®. Change any of the times to suit you.

It's built to stay out of your way: one click to start, a countdown on the toolbar icon, and nothing to sign up for. Sounds, notifications, and the site blocker are all off until you turn them on.

Features
• Start, pause, restart, or skip with one click, or press Space
• A countdown badge on the toolbar icon, so you can see the time left at a glance
• Optional alerts when time's up: a gentle bell, chime, or beep, and/or a desktop notification
• Optional auto-start for breaks and focus sessions
• A progress bar under the clock, today's completed sessions, and dots showing how close the long break is
• An optional site blocker that shows a "stay focused" page for the sites you choose, only during focus sessions
• Stats: your totals for today, the week, the month, and all time, with a 16-week calendar
• Optional "Plan my day": pick how many pomodoros to aim for, see roughly when you'd finish, and name each one if you like
• An optional parking lot: jot down stray thoughts mid-focus, and see them again on your break
• Optional break ideas: something quick and screen-free to do on each break
• Back up your settings, stats, and parked thoughts to a file, and restore them on any device
• A built-in guide to the technique and how to use it
• Light and dark themes that follow your system, or pick one yourself
• Optional quotes on the timer screen: focus quotes while you work, rest quotes on breaks
• Large, easy-to-read text, with keyboard and screen reader support
• Alt+Shift+P opens Tomomomento from anywhere in Chrome

Private by design
Tomomomento has no account, no ads, no analytics, and no tracking. It makes no network requests. Your settings, stats, plan, and parked thoughts stay in your browser. Backups are files you save yourself.

Free and open source
Tomomomento is free and always will be. The code is open under the MIT License. It was built with Claude Code, Anthropic's AI coding assistant. Not using Chrome? The same timer runs in any browser on the website below.

What's new in 1.3
• Parking lot (optional): a notepad button for jotting down a stray thought mid-focus. Your next break reminds you what you parked. Turn it on in Settings > Planning.
• Break ideas (optional): each break suggests something quick and screen-free, like stretching or refilling your water. Turn it on in Settings > Appearance.
• Back up and restore: save your settings, stats, plan, and parked thoughts to a file, and restore them here or on another device. Nothing is uploaded.

Links
Website: https://tomomomento.com
Source code: https://github.com/jtpoltorak/tomomomento
Full changelog: https://github.com/jtpoltorak/tomomomento/blob/main/CHANGELOG.md
Questions or ideas: support@tomomomento.com

Pomodoro® and the Pomodoro Technique® are registered trademarks of Francesco Cirillo. Tomomomento isn't affiliated with or endorsed by Francesco Cirillo.
```

**Store icon:** `public/icons/icon-128.png`

**Screenshots** (1280×800, in this order):

1. `images/screenshot-1-focus.png`: the timer during a focus session
2. `images/screenshot-2-parking.png`: the parking lot
3. `images/screenshot-3-stats.png`: Stats, in the dark theme
4. `images/screenshot-4-break.png`: a short break, with a break idea and parked thoughts
5. `images/screenshot-5-blocker.png`: the "stay focused" page

**Small promo tile** (440×280): `images/promo-small.png`

**Marquee promo tile** (1400×560, optional): `images/promo-marquee.png`

**Official URL:** optional. To use https://tomomomento.com, first verify the domain in [Google Search Console](https://search.google.com/search-console) with the same Google account; otherwise skip it.

**Homepage URL:** https://tomomomento.com

**Support URL:** https://tomomomento.com/legal.html#contact (no GitHub account needed to reach you)

The description is plain text: the store doesn't turn URLs or emails in it into
links. The clickable links on the listing come from the **Homepage URL** and
**Support URL** fields above and the developer contact email (Account page,
shown under Details). That's why the description keeps its links together in
one "Links" block, where they're easy to spot and copy.

**Mature content:** No

## Privacy practices tab

**Single purpose:**

> A focus timer that alternates focus sessions and breaks.

**Permission justifications:**

| Permission                                       | Justification                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `alarms`                                         | Wakes the extension when a focus session or break ends, so the timer keeps working while the popup is closed.                                          |
| `notifications`                                  | Shows the optional "time's up" notification, which is off until the user turns it on.                                                                  |
| `offscreen`                                      | Plays the optional "time's up" sound. Service workers can't play audio, so a hidden offscreen document does it.                                        |
| `storage`                                        | Remembers the timer and the user's settings.                                                                                                           |
| `declarativeNetRequestWithHostAccess` (optional) | Used only when the user turns on the site blocker: redirects the sites on their list to the extension's "stay focused" page during focus sessions.     |
| Host permission `<all_urls>` (optional)          | Requested only when the user turns on the site blocker, because the user can list any site; given back when they turn it off. No page content is read. |

**Are you using remote code?** No, I am not using remote code.

**Data usage:** check none of the data types. Then check all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://tomomomento.com/legal.html#privacy

## Distribution tab

- **Payments:** Free of charge
- **Visibility:** Public (or Unlisted first, if you'd like to try the store install before anyone can find it)
- **Distribution:** All regions

## Publishing an update

1. Bump `version` in `package.json` (the build copies it into the manifest).
   The store rejects a zip whose version isn't higher than the published one.
2. Add the release to [CHANGELOG.md](../CHANGELOG.md) and the "What's new"
   lines in the description above.
3. `npm run package` writes `tomomomento-<version>.zip`. If the UI changed,
   rerun `node scripts/store-images.mjs` too.
4. In the dashboard, open the item, go to **Package** > **Upload new package**,
   and upload the zip. Update the **Store listing** tab (description,
   screenshots) if they changed, then **Submit for review**. The live version
   stays up until the update is approved.
