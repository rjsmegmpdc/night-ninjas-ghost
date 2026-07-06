# Club datastore setup (Cloudflare D1, one-time, ~5 minutes)

The Club page's shared features — course leaderboards (Ninja Loop,
Waiwera) and the Ninja Champs live standings — read from a Cloudflare D1
database behind the existing `ghost-strava-oauth` worker.

- **Reads are public** — anyone on the Club page sees leaderboards and
  standings with no login.
- **Writes are admin-only** — the race-day admin taps "Admin" on the Club
  page, verifies their email with a 6-digit code (Cloudflare Access, same
  flow as Profile Sync), and their email must be in the worker's
  `ADMIN_EMAILS` allowlist.

Prerequisite: the Access application from `docs/ACCESS-SETUP.md`
(Profile Sync setup) must already exist — club admin auth reuses it.

## Steps

From `oauth-worker/` in a terminal:

```bash
# 1. Create the database
npx wrangler d1 create ghost-club

# 2. Apply the schema
npx wrangler d1 execute ghost-club --remote --file=club-schema.sql
```

3. In `wrangler.toml`, uncomment/fill:

```toml
[vars]
ADMIN_EMAILS = "you@example.com"          # comma-separated for multiple admins

[[d1_databases]]
binding       = "CLUB_DB"
database_name = "ghost-club"
database_id   = "<id printed by wrangler d1 create>"
```

4. Deploy:

```bash
npx wrangler deploy
```

5. Verify: `GET <worker>/club/data` returns
   `{"members":[],"results":[],"champsEntries":[],"champsWinners":[]}`
   and the Club page's Champs / Ninja Loop / Waiwera tabs render instead
   of the "Not switched on yet" card.

## Race-day flow (Ninja Champs)

1. Admin opens the Club page on their phone → **Admin →** → email code
2. Champs tab → "Register / update entry": pick or add the athlete,
   enter their rolling-12-month 5k / 10k / 21.1k PBs — leave the
   Millwater time blank. That's the registration.
3. As athletes finish: re-pick the athlete (their PBs pre-fill), type
   the finish time, Save — the standings re-rank instantly for everyone
   viewing the page.

Scoring: baseline = Riegel-predicted half from the best of the three PBs
(t × (21.0975/d)^1.06); improvement = baseline ÷ actual; rank descending.

## Endpoints (reference)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/club/data` | none | Everything the Club page renders |
| POST | `/club/member` | admin | Add member `{name, sex, yob}` |
| POST | `/club/result` | admin | Add course effort `{memberId, course, date, timeS}` |
| POST | `/club/champs-entry` | admin | Upsert `{memberId, year, pb5kS, pb10kS, pb21kS, actualS}` |
| POST | `/club/winner` | admin | Upsert `{year, name, note}` |
| DELETE | `/club/result?id=` | admin | Remove an effort |
| DELETE | `/club/champs-entry?id=` | admin | Remove an entry |
