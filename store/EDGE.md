# Microsoft Edge Add-ons listing

Tomomomento runs in Edge as is: Edge is built on Chromium, so the same zip
from `npm run package` works. Everything to fill in at the
[Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)
is below. Text not repeated here (the description, permission justifications)
comes from [LISTING.md](LISTING.md), so both stores stay in step.

## One-time setup

1. Sign in at the Partner Center link above with a Microsoft account and
   register for the Microsoft Edge program. Registration is free. Register as
   an individual developer.
2. Click **Create new extension**.

## Packages

Upload `tomomomento-<version>.zip`, the same file as the Chrome upload. Partner
Center reads the name, version and permissions from it.

## Availability

- **Visibility:** Public
- **Markets:** all markets

## Properties

- **Category:** Productivity
- **Privacy policy:** yes, the extension has one:
  https://tomomomento.com/legal.html#privacy
- **Website URL:** https://tomomomento.com
- **Support contact details:** https://tomomomento.com/legal.html#contact
- **Mature content:** No

## Store listings (English)

- **Description:** the **Description** block in [LISTING.md](LISTING.md),
  pasted as is.
- **Extension store logo** (300×300): `images/logo-300.png`
- **Small promotional tile** (440×280): `images/promo-small.png`
- **Screenshots** (1280×800): the five `images/screenshot-*.png`, in the
  same order as Chrome.
- **Large promotional tile** (1400×560, optional): `images/promo-marquee.png`
- **Short description:** the manifest summary:

  > A simple, customizable focus timer: focus sessions, short and long breaks, and optional sound and notification alerts.

- **Search terms:** focus timer, pomodoro, productivity, ADHD, study timer,
  break reminder, site blocker

## Notes for certification

Edge reviewers read this box. Paste:

> Tomomomento is a free focus timer with no account, no network requests and no data collection. Every option is off by default. Permissions: alarms (wakes the timer when a phase ends), storage (settings and timer state), notifications (optional "time's up", paused reminder and hourly time check), offscreen (plays optional sounds, since service workers can't play audio), idle (optional "Pause when I step away"), contextMenus (optional right-click shortcuts). The optional site blocker asks for declarativeNetRequestWithHostAccess and host access only when the user turns it on. To test: click the toolbar icon, press Start, and open Settings (gear icon) to try the options.

Then **Publish**. Edge's review usually takes a few business days. Updates
work the same way: upload the new zip under **Packages**, update the listing
if it changed, and publish.
