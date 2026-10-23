# Chrome Web Store listing

Everything to paste into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
for Tomomomento 1.12.0 (what changed: [CHANGELOG.md](../CHANGELOG.md)). Images are in [`images/`](images); regenerate them with
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
• Optional "Just start": a 10-minute focus session for days when a full one feels like too much
• Optional "Keep going": five more minutes of focus when a session ends mid-flow
• An optional heads-up a minute before focus or a break ends
• An optional calm clock that shows whole minutes instead of ticking seconds
• An optional reminder when the timer sits paused for 10 minutes
• An optional focus sound: soft ticking, brown noise, rain, or ocean waves while you work
• An optional minimal timer: just the clock, the progress bar and one button
• Optional animated digits that roll gently into place
• Accessibility options: larger text, high contrast, color-blind friendly colors, an easy-read font, and reduced motion
• Optional "Settle in": 30 seconds of slow breathing before a focus session starts
• Optional "Step away" check: focus pauses when you leave the computer, and asks when you're back
• Optional take-care reminders: water, a stretch, or resting your eyes after a few sessions in a row
• An optional lava lamp background: soft colors drifting slowly behind the timer
• Optional small wins: a quick "Nice work!" when a focus session finishes
• Optional rhythm presets: Classic 25/5, Short 15/3 or Deep 50/10 in one tap
• An optional day wrap-up: sort the day's parked thoughts one at a time in the evening
• Optional right-click shortcuts: park selected text, or block the site you're on
• An optional "Ends at" line that shows what time the timer finishes
• An optional first-tiny-step question when you press Start
• An optional energy check-in that shows which times of day go best for you
• Optional keyboard shortcuts: S skips, R restarts, P parks a thought
• An optional weekly look-back: last week's pomodoros, focus time and best day
• An optional distraction tally: tap "I drifted" and see the trend week to week
• An optional visual timer: a colored disc that shrinks as time passes
• An optional daily intention: "What matters most today?" kept at the top of the timer
• Optional "Where was I?": jot where you left off when you pause, and see it when you come back
• An optional hourly time check: a quiet notice on the hour, timer or not
• Starter setups: Gentle start, Deep work, Low stimulation or Know yourself in one tap
• Search in Settings to find any option fast
• An optional live toolbar icon: a ring that empties as the timer runs
• An optional big timer view that fills the window, for reading from across the room
• An optional focus garden: a little plant in Stats for each pomodoro this week
• A built-in guide to the technique and how to use it
• Light and dark themes that follow your system, or pick one yourself
• Optional quotes on the timer screen: focus quotes while you work, rest quotes on breaks
• Large, easy-to-read text, with keyboard and screen reader support
• Alt+Shift+P opens Tomomomento from anywhere in your browser

Private by design
Tomomomento has no account, no ads, no analytics, and no tracking. It makes no network requests. Your settings, stats, plan, and parked thoughts stay in your browser. Backups are files you save yourself.

Free and open source
Tomomomento is free and always will be. The code is open under the MIT License. It was built with Claude Code, Anthropic's AI coding assistant. Prefer not to install anything? The same timer runs in any browser on the website below.

What's new in 1.12
Fun to look at, and the classic look stays the default. Each one is off until you turn it on in Settings.
• Live toolbar icon: while the timer runs, the toolbar icon becomes a ring in the phase's color that empties as time passes.
• Big timer view: one button fills the whole window with the clock, the color sinking down the screen as time passes. Great on a second screen.
• Focus garden: Stats grows a little plant for each pomodoro you finish this week. A fresh garden every Monday, and nothing ever wilts.
• Breathing circle: while settling in, a soft circle grows and shrinks with each breath in place of the clock.

Also recently added: starter setups, settings search, "Where was I?", an hourly time check, a daily intention, a visual timer, a distraction tally, a weekly look-back, keyboard shortcuts, an "Ends at" time, a first-tiny-step question, an energy check-in, rhythm presets, an evening wrap-up for parked thoughts, right-click shortcuts, a lava lamp background, rain and ocean waves focus sounds, small wins, 30 seconds of slow breathing before focus, an automatic pause when you step away, take-care reminders, a minimal timer, and accessibility options like larger text, high contrast, and color-blind friendly colors.

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
4. `images/screenshot-4-break.png`: a short break, with a break idea, parked thoughts, and "+5 min focus"
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

| Permission                                       | Justification                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `alarms`                                         | Wakes the extension when a focus session or break ends, so the timer keeps working while the popup is closed.                                                                                          |
| `idle`                                           | Used only when the user turns on "Pause when I step away": pauses a focus session after 5 minutes without keyboard or mouse input. Only "active", "idle" or "locked" is read.                          |
| `contextMenus`                                   | Used only when the user turns on "Right-click shortcuts": adds "Park this thought" for selected text and "Block this site during focus" for a page. Nothing is read until the user picks one of these. |
| `notifications`                                  | Shows the optional "time's up" notification, the paused reminder and the hourly time check, each off until the user turns it on.                                                                       |
| `offscreen`                                      | Plays the optional "time's up" sound and focus sound. Service workers can't play audio, so a hidden offscreen document does it.                                                                        |
| `storage`                                        | Remembers the timer and the user's settings.                                                                                                                                                           |
| `declarativeNetRequestWithHostAccess` (optional) | Used only when the user turns on the site blocker: redirects the sites on their list to the extension's "stay focused" page during focus sessions.                                                     |
| Host permission `<all_urls>` (optional)          | Requested only when the user turns on the site blocker, because the user can list any site; given back when they turn it off. No page content is read.                                                 |

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
