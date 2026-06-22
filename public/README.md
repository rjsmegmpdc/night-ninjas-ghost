# VELOCITY

**VELOCITY** is a local-first running training analysis app built for the Night Ninjas community running club. All data lives on your machine — nothing is uploaded to the cloud.

## What it does

VELOCITY helps you track and analyze your running training with precision:

- **Patrol** — Dashboard with training load matrix and compliance status
- **Dojo** — Training plan management with multiple methodologies (Daniels, Pfitzinger, Lydiard, Polarised, and more)
- **Strike** — Fitness metrics (VO2max trends, biometric insights, load distribution)
- **Recon** — Deep analysis (weekly history, injury vulnerability, monotony triggers, interruption detection)
- **Race** — Race planning, taper management, weather forecasting, heat advisory
- **Coach Log** — Manual session logging and plan adjustments
- **Calendar** — Week-by-week calendar view
- **VO2max** — Dedicated VO2max tracking and insights
- **Shoes** — Footwear tracking and mileage management
- **Journal** — Training notes and reflections
- **Profile** — Athlete settings, strength preferences, wellness tracking, injury ledger
- **Settings** — Strava setup, club share configuration, data export
- **Help** — In-app guide

## Data sources

- **Strava** — Fully supported. Connect during setup or in Settings to sync activities.
- **Garmin** — Under development.

## System requirements

- Node.js 20.11.0 or higher
- npm 9.0.0 or higher
- macOS, Linux, or Windows with access to Electron runtime

## Quick start

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/velocity.git
   cd velocity
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:3000`.

5. On first run, the setup wizard will walk you through Strava connection and initial configuration.

## Data storage

- **SQLite database** — All activities, plans, and settings are stored locally in `%APPDATA%\NightNinjas\shadow-tracker.db`
- **Secure credential storage** — Your Strava credentials are stored securely in your system keychain (service: `NightNinjas-ShadowTracker`)
- **No cloud sync** — Your data never leaves your machine

## Club share

VELOCITY includes a club-share feature to export your training summary for sharing with the Night Ninjas community:

1. Go to **Settings** and configure your parkrun ID and privacy terms
2. Click **Export Club Share** to generate a JSON file
3. The exported schedule is saved to `~/VELOCITY/exports/schedule-current.json`
4. Archived exports are stored in `~/VELOCITY/exports/history/`

This feature helps you collaborate and share progress within the club.

## Storage note (important)

Internal storage paths use the `NightNinjas` namespace to maintain compatibility with existing user databases. Do not rename or move the following paths:

- `%APPDATA%\NightNinjas\shadow-tracker.db`
- Keychain service: `NightNinjas-ShadowTracker`

Renaming these would orphan your existing database and credentials. User-facing exports and settings use VELOCITY naming.

## Development

For development information, see BRAND.md and PHASES.md in the project root.

## Support

Use the **Help** page within the app for troubleshooting and feature guidance.
