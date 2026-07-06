# GHOST — Getting started (Night Ninjas members)

GHOST is the club's training tracker. It runs entirely in your browser —
no account, no server holding your data, nothing to pay for. Setup is a
one-time job of about five minutes; after that you just open it and run.

**App**: https://night-ninjas-ghost.pages.dev
**In-app version of this guide**: Help page → Getting started

---

## Before you start — iPhone users

**Add GHOST to your home screen FIRST, then do the setup inside it.**

Safari → open the app link → Share button → **Add to Home Screen** → open
GHOST from the new icon.

Why first? iPhones give the home-screen app its own separate storage. If
you set up in a Safari tab and *then* add to home screen, the icon opens
an empty app and you'll do setup twice.

Android and desktop: no special order — set up wherever, install
whenever.

## Step 1 — The privacy card

The first open shows exactly what GHOST stores on your phone. Short
version: everything stays on your device. Tap **Got it — let's go**.

## Step 2 — Create your Strava API app (once, ~2 minutes)

GHOST talks to Strava through *your own* free API connection — that's
what keeps the club out of your data.

The setup wizard walks you through it:

1. Open **strava.com/settings/api** (link in the wizard) and log in
2. Fill in the form — the wizard shows the exact values, with **Copy
   buttons** for the two fiddly ones (Website and Authorization Callback
   Domain)
3. Upload any photo as the app icon (Strava insists — your shoes work)
4. Strava shows a **Client ID** and **Client Secret** — copy each into
   Step 2 of the wizard, then **Save & continue**

These identify your API connection, not your account. GHOST never sees
your Strava password.

## Step 3 — Connect with Strava

Tap the orange **Connect with Strava** button and approve on Strava's
page — tick the privacy checkbox if you want private activities
included. Your last 90 days of running syncs automatically. (Want your
full history? Setup → "Pull full history" — it takes a while due to
Strava's rate limits, and resumes by itself.)

## Step 4 (optional but recommended) — Back up your profile

Setup → **Profile Sync** → **Back up this device**:

1. Enter your email → type the 6-digit code from your inbox
2. Choose a passphrase, 8+ characters — **there is no reset**, so make
   it memorable. Lose it and you simply back up again from a working
   device.

Setting up a second device later (phone + laptop) becomes: **Restore to
this device** → same email + code + passphrase → Connect with Strava.
No wizard, no copy-paste. Backups are encrypted with your passphrase
*before* leaving your device — nobody can read them, including the
person running the site.

## Step 5 — Make it yours

- **Settings → Preferences**: home page (where the GHOST logo takes
  you), font size, six colour themes including a light mode
- **Calendar**: add your goal race — NZ halves and marathons are
  searchable by name
- **Dojo**: pick a training methodology and watch your week-by-week
  calendar build itself

---

## Quick answers

**Is my data private?** Yes. Training data lives only on your device.
No analytics, no tracking. The club can't see your runs.

**What if I clear my browser data?** That deletes your local database —
avoid "clear site data" for this site. Your activities re-sync from
Strava, but journal entries and settings are only recoverable from a
Profile Sync backup or a Settings → Export file.

**The app looks outdated / missing features?** Close *all* GHOST tabs
and reopen — updates activate on the next full load.

**Something's broken?** Check the Help page (Troubleshooting section)
or ask in the club chat.
