/**
 * GHOST — Strava OAuth token-swap Worker
 *
 * This is the ONLY piece of server-side code in GHOST.
 * It exists solely because Strava blocks CORS on /oauth/token and /oauth/revoke.
 *
 * Endpoints:
 *   POST /exchange  — swap authorization code for access + refresh tokens
 *   POST /refresh   — exchange a refresh token for a new access token
 *   POST /revoke    — revoke an access token (deauthorise the app for this athlete)
 *
 * Secrets (set via `wrangler secret put`):
 *   STRAVA_CLIENT_ID
 *   STRAVA_CLIENT_SECRET
 */

interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  ALLOWED_ORIGIN: string;
}

const STRAVA_TOKEN_URL  = 'https://www.strava.com/oauth/token';
const STRAVA_REVOKE_URL = 'https://www.strava.com/oauth/revoke';

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin  = request.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGIN;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(allowed) });
    }

    // Only accept POST from the allowed origin
    if (request.method !== 'POST' || (origin && origin !== allowed)) {
      return new Response('Forbidden', { status: 403 });
    }

    const url  = new URL(request.url);
    const body = await request.json<{ code?: string; refresh_token?: string; token?: string }>();

    // -----------------------------------------------------------------------
    // POST /revoke — revoke access token (Strava deauthorisation)
    // -----------------------------------------------------------------------
    if (url.pathname === '/revoke' && body.token) {
      const res = await fetch(STRAVA_REVOKE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: body.token }),
      });
      const data = await res.text();
      return new Response(data, {
        status:  res.status,
        headers: { 'Content-Type': 'application/json', ...cors(allowed) },
      });
    }

    // -----------------------------------------------------------------------
    // POST /exchange or /refresh — token operations that need client_secret
    // -----------------------------------------------------------------------
    let stravaPayload: Record<string, string>;

    if (url.pathname === '/exchange' && body.code) {
      stravaPayload = {
        client_id:     env.STRAVA_CLIENT_ID,
        client_secret: env.STRAVA_CLIENT_SECRET,
        code:          body.code,
        grant_type:    'authorization_code',
      };
    } else if (url.pathname === '/refresh' && body.refresh_token) {
      stravaPayload = {
        client_id:     env.STRAVA_CLIENT_ID,
        client_secret: env.STRAVA_CLIENT_SECRET,
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

    const data = await res.text();
    return new Response(data, {
      status:  res.status,
      headers: { 'Content-Type': 'application/json', ...cors(allowed) },
    });
  },
};
