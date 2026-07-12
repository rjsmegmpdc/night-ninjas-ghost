import { COACH_SYSTEM_PROMPT } from './coach-prompt';
import { PLAN_SYSTEM_PROMPT } from './plan-prompt';

/**
 * GHOST — Strava OAuth token-swap Worker
 *
 * This is the ONLY piece of server-side code in GHOST.
 * It exists solely because Strava blocks CORS on /oauth/token and /oauth/revoke.
 *
 * Endpoints:
 *   POST /exchange      — swap authorization code for access + refresh tokens
 *   POST /refresh       — exchange a refresh token for a new access token
 *   POST /revoke        — revoke an access token (deauthorise the app for this athlete)
 *   GET  /sync/start    — Access-protected; bounces the Cloudflare Access JWT
 *                         back to the app in a URL fragment (no third-party
 *                         cookies, so it works on mobile Safari)
 *   GET  /sync/profile  — Bearer <Access JWT>; returns the caller's profile blob
 *   PUT  /sync/profile  — Bearer <Access JWT>; stores the caller's profile blob
 *
 * Credential resolution: requests may carry their own client_id +
 * client_secret (per-user API apps entered in the Setup wizard) — those win.
 * The env secrets remain as a fallback for baked-in shared-app deployments,
 * and are optional (a pure BYO deployment needs only ALLOWED_ORIGIN).
 *
 * Secrets (set via `wrangler secret put`, optional):
 *   STRAVA_CLIENT_ID
 *   STRAVA_CLIENT_SECRET
 *
 * Profile sync additionally needs (see docs/ACCESS-SETUP.md):
 *   [vars] ACCESS_TEAM_DOMAIN  e.g. "yourteam.cloudflareaccess.com"
 *   [vars] ACCESS_AUD          the Access application's Audience (AUD) tag
 *   [[kv_namespaces]] SYNC_KV  profile blob storage
 */

interface Env {
  STRAVA_CLIENT_ID?: string;
  STRAVA_CLIENT_SECRET?: string;
  ALLOWED_ORIGIN: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  SYNC_KV?: KVNamespace;
  /** Club datastore (leaderboards, Ninja Champs). See docs/CLUB-SETUP.md. */
  CLUB_DB?: D1Database;
  /** Comma-separated emails allowed to write club data (race-day admins). */
  ADMIN_EMAILS?: string;
  /** AI coach — set via: npx wrangler secret put ANTHROPIC_API_KEY */
  ANTHROPIC_API_KEY: string;
}

const STRAVA_TOKEN_URL  = 'https://www.strava.com/oauth/token';
const STRAVA_REVOKE_URL = 'https://www.strava.com/oauth/revoke';

/** Profile blobs are tiny (creds + prefs); reject anything suspicious. */
const MAX_PROFILE_BYTES = 8192;

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// ---------------------------------------------------------------------------
// Cloudflare Access JWT verification (RS256 against the team's JWKS)
// ---------------------------------------------------------------------------

interface AccessJwk {
  kid: string;
  kty: string;
  alg: string;
  n: string;
  e: string;
}

// JWKS cached per isolate; Access rotates keys rarely.
let certsCache: { keys: AccessJwk[]; fetchedAt: number } | null = null;

async function getAccessCerts(teamDomain: string): Promise<AccessJwk[]> {
  if (certsCache && Date.now() - certsCache.fetchedAt < 60 * 60 * 1000) {
    return certsCache.keys;
  }
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs fetch failed (${res.status})`);
  const data = await res.json<{ keys: AccessJwk[] }>();
  certsCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s))) as T;
}

/** Verifies an Access JWT and returns the authenticated email. Throws on any failure. */
async function verifyAccessJwt(token: string, teamDomain: string, aud: string): Promise<string> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed JWT');
  const [headerB64, payloadB64, sigB64] = parts;

  const header = b64urlToJson<{ kid?: string; alg?: string }>(headerB64);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('unexpected JWT header');

  const keys = await getAccessCerts(teamDomain);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    b64urlToBytes(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) throw new Error('bad signature');

  const payload = b64urlToJson<{ aud?: string | string[]; exp?: number; iss?: string; email?: string }>(payloadB64);
  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audList.includes(aud)) throw new Error('aud mismatch');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('expired');
  if (payload.iss !== `https://${teamDomain}`) throw new Error('iss mismatch');
  if (!payload.email) throw new Error('no email claim');
  return payload.email.toLowerCase();
}

// ---------------------------------------------------------------------------
// /sync/* — profile backup + restore
// ---------------------------------------------------------------------------

async function handleSync(request: Request, env: Env, url: URL): Promise<Response> {
  const allowed = env.ALLOWED_ORIGIN;

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.SYNC_KV) {
    return new Response('Profile sync not configured on this deployment', {
      status: 501, headers: cors(allowed),
    });
  }

  // GET /sync/start — top-level navigation that has passed Access. Bounce the
  // JWT back to the app in the URL fragment (fragments never hit servers/logs).
  if (url.pathname === '/sync/start' && request.method === 'GET') {
    const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!jwt) {
      return new Response(
        'No Access JWT — this path must be behind Cloudflare Access (see docs/ACCESS-SETUP.md)',
        { status: 403 },
      );
    }
    const returnTo = url.searchParams.get('return_to') ?? '';
    if (!returnTo.startsWith(allowed)) {
      return new Response('Bad return_to', { status: 400 });
    }
    return Response.redirect(`${returnTo}#sync_token=${jwt}`, 302);
  }

  // GET/PUT /sync/profile — Bearer-authenticated API calls from the app
  if (url.pathname === '/sync/profile') {
    const auth = request.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) {
      return new Response('Missing bearer token', { status: 401, headers: cors(allowed) });
    }

    let email: string;
    try {
      email = await verifyAccessJwt(auth.slice(7), env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'invalid token';
      return new Response(`Unauthorized: ${msg}`, { status: 401, headers: cors(allowed) });
    }

    const key = `profile:${email}`;

    if (request.method === 'GET') {
      const blob = await env.SYNC_KV.get(key);
      if (blob === null) {
        return new Response('No backup found for this account', { status: 404, headers: cors(allowed) });
      }
      return new Response(blob, {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors(allowed) },
      });
    }

    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > MAX_PROFILE_BYTES) {
        return new Response('Profile too large', { status: 413, headers: cors(allowed) });
      }
      try {
        JSON.parse(body);
      } catch {
        return new Response('Body must be JSON', { status: 400, headers: cors(allowed) });
      }
      await env.SYNC_KV.put(key, body);
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors(allowed) },
      });
    }
  }

  return new Response('Not found', { status: 404, headers: cors(allowed) });
}

// ---------------------------------------------------------------------------
// /club/* — shared club datastore (single-admin writes, public reads)
// ---------------------------------------------------------------------------

function json(data: unknown, allowed: string, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(allowed) },
  });
}

/** Verifies the Bearer JWT AND that the email is an allowlisted admin. */
async function requireAdmin(request: Request, env: Env): Promise<string | Response> {
  const allowed = env.ALLOWED_ORIGIN;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAILS) {
    return new Response('Club admin not configured', { status: 501, headers: cors(allowed) });
  }
  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return new Response('Missing bearer token', { status: 401, headers: cors(allowed) });
  }
  let email: string;
  try {
    email = await verifyAccessJwt(auth.slice(7), env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid token';
    return new Response(`Unauthorized: ${msg}`, { status: 401, headers: cors(allowed) });
  }
  const admins = env.ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.includes(email)) {
    return new Response('Not a club admin', { status: 403, headers: cors(allowed) });
  }
  return email;
}

async function handleClub(request: Request, env: Env, url: URL): Promise<Response> {
  const allowed = env.ALLOWED_ORIGIN;
  const db = env.CLUB_DB;
  if (!db) {
    return new Response('Club datastore not configured on this deployment', {
      status: 501, headers: cors(allowed),
    });
  }

  // ---- Public read: everything the Club page needs, one fetch ----
  if (url.pathname === '/club/data' && request.method === 'GET') {
    const [members, results, entries, winners] = await Promise.all([
      db.prepare('SELECT id, name, sex, yob FROM members ORDER BY name').all(),
      db.prepare(
        `SELECT r.id, r.member_id, r.course, r.date, r.time_s, m.name, m.sex, m.yob
         FROM results r JOIN members m ON m.id = r.member_id
         ORDER BY r.date DESC`,
      ).all(),
      db.prepare(
        `SELECT e.id, e.member_id, e.year, e.pb5k_s, e.pb10k_s, e.pb21k_s, e.actual_s,
                m.name, m.sex, m.yob
         FROM champs_entries e JOIN members m ON m.id = e.member_id
         ORDER BY e.year DESC, m.name`,
      ).all(),
      db.prepare('SELECT year, name, note FROM champs_winners ORDER BY year DESC').all(),
    ]);
    return json(
      {
        members: members.results,
        results: results.results,
        champsEntries: entries.results,
        champsWinners: winners.results,
      },
      allowed,
    );
  }

  // ---- Everything below is an admin write ----
  const adminOrError = await requireAdmin(request, env);
  if (adminOrError instanceof Response) return adminOrError;

  if (request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>();

    if (url.pathname === '/club/member') {
      const { name, sex, yob } = body as { name?: string; sex?: string; yob?: number | null };
      if (!name?.trim() || (sex !== 'M' && sex !== 'F')) {
        return new Response('name and sex (M/F) required', { status: 400, headers: cors(allowed) });
      }
      const res = await db
        .prepare('INSERT INTO members (name, sex, yob) VALUES (?, ?, ?)')
        .bind(name.trim(), sex, yob ?? null)
        .run();
      return json({ id: res.meta.last_row_id }, allowed);
    }

    if (url.pathname === '/club/result') {
      const { memberId, course, date, timeS } = body as {
        memberId?: number; course?: string; date?: string; timeS?: number;
      };
      if (!memberId || !course || !date || !timeS || timeS <= 0) {
        return new Response('memberId, course, date, timeS required', { status: 400, headers: cors(allowed) });
      }
      const res = await db
        .prepare('INSERT INTO results (member_id, course, date, time_s) VALUES (?, ?, ?, ?)')
        .bind(memberId, course, date, Math.round(timeS))
        .run();
      return json({ id: res.meta.last_row_id }, allowed);
    }

    if (url.pathname === '/club/champs-entry') {
      const { memberId, year, pb5kS, pb10kS, pb21kS, actualS } = body as {
        memberId?: number; year?: number;
        pb5kS?: number | null; pb10kS?: number | null; pb21kS?: number | null; actualS?: number | null;
      };
      if (!memberId || !year) {
        return new Response('memberId and year required', { status: 400, headers: cors(allowed) });
      }
      await db
        .prepare(
          `INSERT INTO champs_entries (member_id, year, pb5k_s, pb10k_s, pb21k_s, actual_s)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(member_id, year) DO UPDATE SET
             pb5k_s = excluded.pb5k_s, pb10k_s = excluded.pb10k_s,
             pb21k_s = excluded.pb21k_s, actual_s = excluded.actual_s`,
        )
        .bind(memberId, year, pb5kS ?? null, pb10kS ?? null, pb21kS ?? null, actualS ?? null)
        .run();
      return json({ ok: true }, allowed);
    }

    if (url.pathname === '/club/winner') {
      const { year, name, note } = body as { year?: number; name?: string; note?: string | null };
      if (!year || !name?.trim()) {
        return new Response('year and name required', { status: 400, headers: cors(allowed) });
      }
      await db
        .prepare(
          `INSERT INTO champs_winners (year, name, note) VALUES (?, ?, ?)
           ON CONFLICT(year) DO UPDATE SET name = excluded.name, note = excluded.note`,
        )
        .bind(year, name.trim(), note ?? null)
        .run();
      return json({ ok: true }, allowed);
    }
  }

  if (request.method === 'DELETE') {
    const id = Number(url.searchParams.get('id'));
    if (!id) return new Response('id required', { status: 400, headers: cors(allowed) });

    if (url.pathname === '/club/result') {
      await db.prepare('DELETE FROM results WHERE id = ?').bind(id).run();
      return json({ ok: true }, allowed);
    }
    if (url.pathname === '/club/champs-entry') {
      await db.prepare('DELETE FROM champs_entries WHERE id = ?').bind(id).run();
      return json({ ok: true }, allowed);
    }
  }

  return new Response('Not found', { status: 404, headers: cors(allowed) });
}

// ---------------------------------------------------------------------------
// /ai — streaming Claude coach endpoint
// ---------------------------------------------------------------------------

async function handleAi(request: Request, env: Env, allowed: string): Promise<Response> {
  const corsHeaders = (o: string) => ({
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  let body: { athleteId?: unknown; context?: unknown; question?: unknown; model?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(allowed) } });
  }

  const athleteId = Number(body.athleteId);
  if (!athleteId || athleteId <= 0) {
    return new Response(JSON.stringify({ error: 'athleteId required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(allowed) } });
  }

  const context = String(body.context ?? '').trim();
  const question = String(body.question ?? '').trim();
  if (!context || !question) {
    return new Response(JSON.stringify({ error: 'context and question required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(allowed) } });
  }

  const model = String(body.model ?? 'claude-haiku-4-5-20251001');
  const ALLOWED_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'];
  if (!ALLOWED_MODELS.includes(model)) {
    return new Response(JSON.stringify({ error: 'Invalid model' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(allowed) } });
  }

  // Import Anthropic SDK (dynamic import so it only loads when needed)
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Stream in background — Cloudflare Workers support this pattern
  (async () => {
    try {
      const stream = await anthropic.messages.stream({
        model,
        max_tokens: 512,
        system: COACH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `${context}\n\n${question}` }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const data = `data: ${JSON.stringify({ text: event.delta.text })}\n\n`;
          await writer.write(encoder.encode(data));
        }
      }
      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI error';
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...corsHeaders(allowed),
    },
  });
}

// ---------------------------------------------------------------------------
// /generate-plan — AI-generated personalized training plan (non-streaming)
// ---------------------------------------------------------------------------

async function handleGeneratePlan(request: Request, env: Env, allowed: string): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  let body: { athleteId?: unknown; context?: unknown; goalDistanceKm?: unknown; goalTimeS?: unknown; weeksAvailable?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const athleteId = Number(body.athleteId);
  if (!athleteId || athleteId <= 0) {
    return new Response(JSON.stringify({ error: 'athleteId required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const context = String(body.context ?? '').trim();
  const goalDistanceKm = Number(body.goalDistanceKm ?? 42.195);
  const goalTimeS = Number(body.goalTimeS ?? 0);
  const weeksAvailable = Math.max(4, Math.min(20, Number(body.weeksAvailable ?? 16)));

  if (!context) {
    return new Response(JSON.stringify({ error: 'context required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const userPrompt = [
    context,
    '',
    `Goal race: ${goalDistanceKm}km${goalTimeS > 0 ? ` in ${Math.floor(goalTimeS / 3600)}h${Math.floor((goalTimeS % 3600) / 60)}m` : ''}`,
    `Weeks available to race day: ${weeksAvailable}`,
    `Generate a ${weeksAvailable}-week personalized training plan. Return JSON only.`,
  ].join('\n');

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: PLAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = message.content.find((b) => b.type === 'text')?.text ?? '';
    // Validate it's JSON before returning
    JSON.parse(text);

    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Plan generation failed';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin  = request.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGIN;
    const url     = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(allowed) });
    }

    // Profile sync routes (GET/PUT; /sync/start is a top-level navigation
    // with no Origin header — auth there is Cloudflare Access itself)
    if (url.pathname.startsWith('/sync/')) {
      if (origin && origin !== allowed) {
        return new Response('Forbidden', { status: 403 });
      }
      return handleSync(request, env, url);
    }

    // Club datastore routes (public GET /club/data; admin-gated writes).
    // No-Origin callers are non-browser and must be rejected — /club/data is
    // always called via browser fetch, which always sends Origin.
    if (url.pathname.startsWith('/club/')) {
      if (!origin || origin !== allowed) {
        return new Response('Forbidden', { status: 403 });
      }
      return handleClub(request, env, url);
    }

    // Only accept POST from the allowed origin.
    // No short-circuit: a missing Origin is treated the same as a wrong one.
    if (request.method !== 'POST' || origin !== allowed) {
      return new Response('Forbidden', { status: 403 });
    }

    // AI coach streaming endpoint — handles its own body parsing
    if (url.pathname === '/ai') return handleAi(request, env, allowed);

    // AI plan generation endpoint — handles its own body parsing
    if (url.pathname === '/generate-plan') return handleGeneratePlan(request, env, allowed);

    const body = await request.json<{
      code?: string;
      refresh_token?: string;
      token?: string;
      client_id?: string;
      client_secret?: string;
    }>();

    // -----------------------------------------------------------------------
    // Credential resolution — per-user credentials win; env secrets are the
    // fallback. Resolved here so /revoke can gate on them too.
    // -----------------------------------------------------------------------
    const clientId     = body.client_id     ?? env.STRAVA_CLIENT_ID;
    const clientSecret = body.client_secret ?? env.STRAVA_CLIENT_SECRET;

    // -----------------------------------------------------------------------
    // POST /revoke — revoke access token (Strava deauthorisation).
    // Requires valid credentials so the worker cannot be used as an
    // unauthenticated proxy to revoke arbitrary tokens.
    // -----------------------------------------------------------------------
    if (url.pathname === '/revoke' && body.token) {
      if (!clientId || !clientSecret) {
        return new Response(
          JSON.stringify({ error: 'Forbidden — supply client_id/client_secret or configure worker secrets' }),
          { status: 403, headers: { 'Content-Type': 'application/json', ...cors(allowed) } },
        );
      }
      const revokeRes = await fetch(STRAVA_REVOKE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: body.token }),
      });
      if (!revokeRes.ok) {
        return new Response(
          JSON.stringify({ error: 'Strava request failed', status: revokeRes.status }),
          { status: revokeRes.status, headers: { 'Content-Type': 'application/json', ...cors(allowed) } },
        );
      }
      const revokeData = await revokeRes.text();
      return new Response(revokeData, {
        status:  revokeRes.status,
        headers: { 'Content-Type': 'application/json', ...cors(allowed) },
      });
    }

    // -----------------------------------------------------------------------
    // POST /exchange or /refresh — token operations that need client_secret
    // -----------------------------------------------------------------------
    if (!clientId || !clientSecret) {
      return new Response('No API credentials — supply client_id/client_secret or configure worker secrets', { status: 400 });
    }

    let stravaPayload: Record<string, string>;

    if (url.pathname === '/exchange' && body.code) {
      stravaPayload = {
        client_id:     clientId,
        client_secret: clientSecret,
        code:          body.code,
        grant_type:    'authorization_code',
      };
    } else if (url.pathname === '/refresh' && body.refresh_token) {
      stravaPayload = {
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: body.refresh_token,
        grant_type:    'refresh_token',
      };
    } else {
      return new Response('Bad request', { status: 400 });
    }

    const res = await fetch(STRAVA_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(stravaPayload),
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: 'Strava request failed', status: res.status }),
        { status: res.status, headers: { 'Content-Type': 'application/json', ...cors(allowed) } },
      );
    }
    const data = await res.text();
    return new Response(data, {
      status:  res.status,
      headers: { 'Content-Type': 'application/json', ...cors(allowed) },
    });
  },
};
