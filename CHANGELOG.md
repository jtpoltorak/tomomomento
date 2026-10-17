# Changelog

What changed in each release of the Chrome extension. The web app at
https://tomomomento.com updates from `main` as changes land, so it gets each of
these first.

## Unreleased

### New

- **Settle in (optional):** pressing Start can begin with 30 seconds of slow
  breathing before the focus clock runs, with the progress bar breathing
  along. "Start now" skips it. Turn it on under Focus helpers in Settings.

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
