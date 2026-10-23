# Changelog

What changed in each release of the Chrome extension. The web app at
https://tomomomento.com updates from `main` as changes land, so it gets each of
these first.

## Unreleased

### New

- **Keyboard shortcuts (optional):** on the timer, <kbd>S</kbd> skips,
  <kbd>R</kbd> restarts, <kbd>P</kbd> parks a thought and <kbd>D</kbd> notes a drift. Turn on
  **Keyboard shortcuts** under Accessibility in Settings.
- **Weekly look-back (optional):** the first time you open the timer each
  week, a short card shows last week's pomodoros, focus time and best day.
  Turn it on under Focus helpers in Settings.
- **Distraction tally (optional):** during focus, tap **I drifted** when your
  attention wanders. Stats compares this week's drifts with last week's.
  Turn on **Distraction tally** under Focus helpers in Settings.
- **Visual timer (optional):** a colored disc in place of the numbers that
  shrinks as time passes. Turn on **Visual timer** under Appearance in Settings.
- **Daily intention (optional):** the first time you open the timer each day,
  it asks "What matters most today?" and keeps your answer at the top until
  midnight. Turn on **Daily intention** under Planning in Settings.

## 1.9.0 (2026-10-22)

### New

- **Ends at (optional):** while the timer runs, a small line under it says
  what time it ends, like "Ends at 2:45 PM". Turn on **Show when it ends**
  under Appearance in Settings.
- **First tiny step (optional):** pressing Start on a new focus session asks
  "What's the first tiny step?" Your answer shows under the timer until the
  session ends. Turn on **Ask for the first tiny step** under Focus helpers
  in Settings.
- **Energy check-in (optional):** on the break after a focus session, tap
  Low, Okay or Great. Stats gets a "Time of day" section showing how
  mornings, afternoons, evenings and nights tend to go. Turn on **Energy
  check-in** under Focus helpers in Settings.

## 1.8.0 (2026-10-22)

### New

- **Rhythm presets (optional):** before a focus session starts, pick
  Classic (25/5), Short (15/3) or Deep (50/10) with one tap under the timer
  choices. It sets all three timer lengths at once. Turn on **Rhythm presets
  on the timer** under Timers in Settings.
- **Day wrap-up (optional):** after 5 pm, if anything is still in the
  parking lot, the timer offers to go through it one thought at a time:
  done, keep for tomorrow, or let go. Turn on **Wrap up my day** under
  Planning in Settings (it needs the parking lot on).
- **Right-click shortcuts (optional):** select text on any page and
  right-click to **Park this thought**, or right-click a page to **Block this
  site during focus**. Turn on **Right-click shortcuts** under Focus helpers
  in Settings. Adds the `contextMenus` permission, which shows no warning.

## 1.7.0 (2026-10-22)

### New

- **Lava lamp background (optional):** soft blobs of color drift slowly
  behind everything, warm during focus and cool on breaks. They stay faint
  enough that all text keeps its contrast, hold still with reduced motion,
  and are left out in high contrast. Turn it on under Appearance in Settings.
- **Rain and ocean waves:** two new focus sounds, next to soft ticking and
  brown noise. Rain patters softly; the waves roll in and wash out about
  every 8 seconds. Pick one under Focus sound in Settings.
- **Small wins (optional):** when a focus session finishes, the progress bar
  glows and a quick "Nice work! 3 done today." shows for a few seconds, or
  the next time you open the timer on that break. No streaks. Turn on
  "Celebrate small wins" under Focus helpers in Settings.

## 1.6.0 (2026-10-17)

### New

- **Settle in (optional):** pressing Start can begin with 30 seconds of slow
  breathing before the focus clock runs, with the progress bar breathing
  along. "Start now" skips it. Turn it on under Focus helpers in Settings.
- **Step away (optional):** if the computer sits untouched for 5 minutes
  during focus, the timer pauses from the moment you left. When you're back,
  resume where you were, or tap "I was working" to count the time. Turn on
  "Pause when I step away" under Focus helpers in Settings. This adds Chrome's
  "idle" permission, which shows no warning.
- **Take-care reminders (optional):** after every 3 focus sessions in a row,
  the break suggests one small thing for you: water, resting your eyes, a
  stretch or a snack. It shows on the timer and in the "time's up"
  notification. Turn it on under Focus helpers in Settings.

## 1.5.0 (2026-10-16)

### New

- **Animated digits (optional):** each number on the clock rolls gently into
  place as it changes. It stays still if your device is set to reduce motion.
  Turn it on under Appearance in Settings.
- **Focus sound (optional):** soft ticking or brown noise while focus runs,
  with its own volume. It stops for breaks and pauses, and the ticks fall in
  step with the clock. Pick one under Focus sound in Settings.
- **Minimal timer (optional):** just the clock, the progress bar and one
  button, with everything else a tap away under Show more. It tidies itself
  back up when the timer starts. Turn it on under Appearance in Settings.
- **Accessibility settings:** a new section in Settings with larger text
  sizes, high contrast, color-blind friendly colors, an easy-read font (Atkinson
  Hyperlegible Next, bundled) and a reduce-motion switch. All are off until you
  turn them on.

## 1.4.0 (2026-10-15)

### New

- **Just start (optional):** on days when 25 minutes feels like too much, a
  "just start: 10 min" link under the clock begins a short focus session that
  counts like any other. Turn it on under Timers in Settings.
- **Heads-up (optional):** a gentle cue a minute before focus or a break
  ends. The progress bar glows softly, the timer says a minute is left, and
  with sound on you'll hear a soft tone. Turn it on under When time's up in
  Settings.
- **Paused reminder (optional):** after 10 minutes on pause, a quiet
  notification asks whether to resume or start over. Turn it on under When
  time's up in Settings.
- **Calm clock (optional):** whole minutes ("24 min") instead of a ticking
  countdown, for when watching the seconds feels stressful. Turn it on under
  Appearance in Settings.
- **Keep going (optional):** still in the flow when focus ends? A "+5 min
  focus" button at the bottom of the timer (and on the notification) puts the
  break off a little. Extra time adds to your focus minutes in Stats without
  counting another pomodoro. Turn it on under When time's up in Settings.

## 1.3.0 (2026-10-14)

### New

- **Parking lot (optional):** a notepad button at the top for jotting down a
  stray thought mid-focus, so it's out of your head without leaving the timer.
  During focus, "+ Park a thought" under the timer opens a quick box right
  there. On your next break, the timer lets you know what you parked. Check
  thoughts off as you deal with them. Off by default; turn it on in Settings >
  Planning. Thoughts stay on your device.
- **Break ideas (optional):** each break suggests something quick and
  screen-free to do, like stretching or refilling your water, with a button for
  another idea. Off by default; turn it on in Settings > Appearance.
- **Try the new helpers:** a one-time card on the timer offers to turn on the
  parking lot and break ideas with one tap. "No thanks" hides it for good, and
  both stay in Settings either way.
- **Back up and restore:** Settings can now save your settings, stats, plan
  and parked thoughts to a file, and restore them here or on another device.
  Restoring adds the backup's stats and parked thoughts to yours rather than
  replacing them. Nothing is uploaded.

## 1.2.0 (2026-10-13)

### New

- **Stats:** a chart button next to Help opens your pomodoro totals for today,
  the last 7 days, this month, and all time, a bar chart of the last 7 days, and
  a 16-week calendar heat map. History starts with this update (today's count
  carries over), stays on your device, and can be cleared with Reset stats.
- **Plan my day (optional):** choose how many pomodoros you'd like to do today,
  see your focus and break time laid out with an estimated finish time, and
  optionally name each pomodoro. A strip under the timer fills in as you go,
  and extra pomodoros count as a bonus. Off by default; turn it on in
  Settings > Planning. Only today's plan is kept, on your device.
- **Help:** the Basics tab now explains Stats and Plan my day.

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
