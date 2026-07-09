# PLAN-AI-COACH.md — AI Coach (Worker-proxied, Matt pays for all athletes)

**Agent brief for Hanzo. Read CLAUDE.md startup ritual first. Branch: `feat/ai-coach`. Never commit to `main`.**

## Mission

Wire up the AI coach so every athlete on the app gets coaching insights powered by Matt's
Anthropic API key — zero friction for club members, no BYOK required. Key never touches
the browser. The context builder (`src/lib/ai/context-pure.ts`) and coach voice
(`src/lib/coach/coach-voice-pure.ts`) are already implemented.

## Architecture decision (from 2026-07-04 session)

**Worker-proxy, not browser-direct.**

Matt's `ANTHROPIC_API_KEY` lives as a Wrangler secret alongside `STRAVA_CLIENT_SECRET`.
The browser posts a prompt context to the Worker; the Worker calls Anthropic and streams
the response back. The key is never in the bundle, never in DevTools.

```
Browser  →  POST /ai  { athleteId, context, question }
Worker   →  Anthropic Messages API  (with ANTHROPIC_API_KEY secret)
         ←  streamed SSE response
Browser  ←  rendered token-by-token in the UI
```

Rate-limit backstop: Worker checks `strava_athlete_id` is a non-zero integer before
forwarding (origin check already in place). Cloudflare KV rate limiting is out of scope
for v1 — add it when the club grows beyond 10.

## Context (verified 2026-07-04)

- `src/lib/ai/context-pure.ts` — `AthleteSnapshot` type + `snapshotToText()` already built
- `src/lib/coach/coach-voice-pure.ts` — coach persona/system prompt already built
- `ANTHROPIC_API_KEY` needs adding as Wrangler secret alongside existing secrets
- Worker currently has 3 endpoints: `/exchange`, `/refresh`, `/revoke`
- Cloudflare Workers support streaming via `ReadableStream` + `TransformStream`
- Anthropic SDK (`@anthropic-ai/sdk`) runs in Cloudflare Workers runtime
- Default model: `claude-haiku-4-5-20251001` (fast, cheap, ~$2–5/month for 10 athletes at 1 query/day)

## Work items (in order)

### 1. Worker `/ai` endpoint
**File:** `oauth-worker/src/index.ts`, `oauth-worker/package.json` (add `@anthropic-ai/sdk`)

- Add `ANTHROPIC_API_KEY: string` to the `Env` interface
- Install `@anthropic-ai/sdk` in the Worker package
- `POST /ai` handler:
  - Validate body: `{ athleteId: number, context: string, question: string, model?: string }`
  - Reject if `athleteId` is 0 or missing (basic abuse guard)
  - Call Anthropic Messages API with streaming:
    - `model`: body.model ?? `claude-haiku-4-5-20251001`
    - `max_tokens`: 512
    - `system`: the coach system prompt (import from a shared constant — see item 2)
    - `messages`: `[{ role: 'user', content: context + '\n\n' + question }]`
  - Stream the response back as `text/event-stream` (SSE)
  - On error: return JSON `{ error: message }` with appropriate status

### 2. Shared system prompt constant
**File:** `oauth-worker/src/coach-prompt.ts` (new)

Extract the coach system prompt here rather than inlining it. Keep it short:
- Role: expert running coach, Night Ninjas club, terse + direct
- Output: plain prose, no markdown headers, no bullet lists, ≤150 words
- Never recommend seeing a doctor for normal training fatigue
- If injury context is present, flag it once and move on

### 3. Browser AI client
**File:** `src/lib/ai/coach-client.ts` (new)

```typescript
export interface CoachRequest {
  athleteId: number;
  context: string;    // snapshotToText(AthleteSnapshot)
  question: string;
}

export async function* streamCoachReply(
  req: CoachRequest,
  workerUrl: string,
): AsyncGenerator<string> { ... }
```

- `fetch` to `${workerUrl}/ai` with `{ stream: true }` Accept header
- Parse SSE `data:` lines, yield each text delta
- Throw on non-2xx or on `{ error }` JSON response
- Caller cancels via `AbortController` (for unmount cleanup)

### 4. Patrol — weekly briefing card
**File:** `src/routes/patrol/PatrolPage.tsx`

- New `CoachBriefingCard` component below the stats row
- Lazy: renders a "Get coaching brief" button first; fetches on click
- Builds `AthleteSnapshot` from existing Patrol query data
- Calls `streamCoachReply` with question: `"Give me a brief coaching note for this week."`
- Renders streaming text token-by-token into a `<p>` with a cursor blink while streaming
- Error state: dim text "Coach unavailable" (never red — non-critical)
- Disabled if Worker URL not configured

### 5. Coach Log — daily wellness interpretation
**File:** `src/routes/coach-log/CoachLogPage.tsx`

- "Ask coach" button on the log entry panel (after saving a journal entry)
- Context: today's journal entry + last 7 days of wellness + recent activities
- Question: `"I just logged my wellness. Any coaching note for today?"`
- Same streaming render pattern as item 4

### 6. Settings — AI coach toggle + model selector
**File:** `src/routes/settings/SettingsPage.tsx`

- New "AI Coach" section (below Strava, above data stats)
- Toggle: `ai_coach_enabled` setting (default `'1'`)
- Model selector (select element): haiku (default) / sonnet — stored as `ai_coach_model`
- Reads `VITE_STRAVA_OAUTH_WORKER` to show Worker status (configured / not configured)
- No API key entry — key is server-side. Just the toggle.

### 7. Worker deploy update
**File:** `oauth-worker/wrangler.toml`

- Document that `ANTHROPIC_API_KEY` must be set:
  ```toml
  # Set via: npx wrangler secret put ANTHROPIC_API_KEY
  ```
- No other config changes needed

## Ground rules (from CLAUDE.md — non-negotiable)

- Branch `feat/ai-coach`; Matt merges. Update `PROGRESS.md` at stop ritual.
- Streaming must cancel cleanly on component unmount (AbortController).
- `snapshotToText()` and `coach-voice-pure.ts` are pure — do not add browser APIs to them.
- AI coach is always opt-out-able via settings toggle; never blocks page load.
- Never store AI responses in the DB — ephemeral only.

## Acceptance criteria

- [ ] `npm run build` green, `npm test` ≥ 483 passing (no regressions)
- [ ] Worker `/ai` endpoint deployed; `ANTHROPIC_API_KEY` wrangler secret set
- [ ] Patrol weekly briefing card streams a real coaching reply end-to-end
- [ ] Coach Log "Ask coach" surfaces a relevant daily note
- [ ] Settings toggle disables the coach cards cleanly
- [ ] Model defaults to Haiku; can be switched to Sonnet in Settings
- [ ] Different athlete connects → coach cards work for them too (uses their athleteId)
- [ ] Unmounting mid-stream does not throw unhandled promise rejection
- [ ] `PROGRESS.md` updated; branch pushed

## Out of scope (later phases)

- Per-athlete KV rate limiting (add when club > 10)
- Race week / taper coaching card (RacePage) — add after Patrol + CoachLog proven
- Recon trend narration — add after Patrol card stable
- Conversation history / follow-up questions — v2
- Cost dashboard / per-athlete token tracking — v2
