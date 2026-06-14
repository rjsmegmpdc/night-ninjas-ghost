/**
 * Native Garmin SSO login with MFA support (Flow 2).
 *
 * ⚠ EXPERIMENTAL - UNTESTED AGAINST LIVE GARMIN ⚠
 *
 * The garmin-connect npm library (1.6.2) does not implement MFA - its
 * handleMFA() is an empty TODO stub, so MFA-enabled accounts fail with
 * "Ticket not found or MFA". This module ports the essential steps of
 * garth's (the reference Python implementation) SSO flow:
 *
 *   1. GET  /sso/embed                      - seed cookies
 *   2. GET  /sso/signin?...                 - obtain CSRF token
 *   3. POST /sso/signin                     - submit credentials
 *        -> success: response embeds a ticket   (no-MFA accounts)
 *        -> "MFA Required" page: extract fresh CSRF, hold session
 *   4. POST /sso/verifyMFA/loginEnterMfaCode - submit the emailed/SMS code
 *        -> response embeds the ticket
 *
 * The ticket is then handed to the library's public getOauth1Token() +
 * exchange() to complete the OAuth1->OAuth2 token exchange, so all the
 * OAuth crypto stays in the maintained library.
 *
 * This was written without the ability to test against Garmin's live SSO
 * (sandboxed build environment). First real-world MFA login may need
 * adjustment - regexes and form fields follow garth's current flow.
 */

const SSO = 'https://sso.garmin.com/sso';
const SSO_EMBED = `${SSO}/embed`;

const CSRF_RE = /name="_csrf"\s+value="(.+?)"/;
const TITLE_RE = /<title>(.+?)<\/title>/;
const TICKET_RE = /embed\?ticket=([^"]+)"/;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** Minimal cookie jar over fetch - Garmin SSO is cookie-dependent. */
class CookieJar {
  private cookies = new Map<string, string>();

  absorb(res: Response): void {
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const line of setCookies) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

export interface MfaPendingSession {
  jar: CookieJar;
  csrf: string;
  createdAt: number;
}

const EMBED_PARAMS = new URLSearchParams({
  id: 'gauth-widget',
  embedWidget: 'true',
  gauthHost: SSO,
});

const SIGNIN_PARAMS = new URLSearchParams({
  id: 'gauth-widget',
  embedWidget: 'true',
  gauthHost: SSO_EMBED,
  service: SSO_EMBED,
  source: SSO_EMBED,
  redirectAfterAccountLoginUrl: SSO_EMBED,
  redirectAfterAccountCreationUrl: SSO_EMBED,
});

async function ssoFetch(
  jar: CookieJar,
  url: string,
  init?: RequestInit & { form?: URLSearchParams }
): Promise<{ res: Response; html: string }> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Cookie: jar.header(),
    origin: 'https://sso.garmin.com',
    referer: `${SSO}/signin`,
  };
  let body: string | undefined;
  if (init?.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = init.form.toString();
  }
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers,
    body,
    redirect: 'follow',
  });
  jar.absorb(res);
  const html = await res.text();
  return { res, html };
}

export type SsoLoginResult =
  | { kind: 'ticket'; ticket: string }
  | { kind: 'mfa-required'; session: MfaPendingSession }
  | { kind: 'error'; error: string };

/**
 * Step 1-3 of the SSO flow. Returns a ticket directly for no-MFA accounts,
 * or a pending session awaiting the MFA code.
 */
export async function ssoLogin(username: string, password: string): Promise<SsoLoginResult> {
  const jar = new CookieJar();

  // 1. Seed cookies
  await ssoFetch(jar, `${SSO_EMBED}?${EMBED_PARAMS}`);

  // 2. CSRF
  const { html: signinHtml } = await ssoFetch(jar, `${SSO}/signin?${SIGNIN_PARAMS}`);
  const csrf1 = CSRF_RE.exec(signinHtml)?.[1];
  if (!csrf1) return { kind: 'error', error: 'Could not obtain CSRF token from Garmin SSO.' };

  // 3. Credentials
  const form = new URLSearchParams({ username, password, embed: 'true', _csrf: csrf1 });
  const { html: postHtml } = await ssoFetch(jar, `${SSO}/signin?${SIGNIN_PARAMS}`, {
    method: 'POST',
    form,
  });

  const title = TITLE_RE.exec(postHtml)?.[1] ?? '';

  if (/MFA/i.test(title)) {
    const csrf2 = CSRF_RE.exec(postHtml)?.[1];
    if (!csrf2) return { kind: 'error', error: 'MFA page reached but CSRF token missing.' };
    return { kind: 'mfa-required', session: { jar, csrf: csrf2, createdAt: Date.now() } };
  }

  if (/locked/i.test(title)) {
    return { kind: 'error', error: 'Garmin reports this account is locked.' };
  }

  const ticket = TICKET_RE.exec(postHtml)?.[1];
  if (!ticket) {
    return { kind: 'error', error: 'Login failed - check email and password.' };
  }
  return { kind: 'ticket', ticket };
}

/**
 * Step 4 - submit the MFA code against a pending session.
 */
export async function ssoSubmitMfa(
  session: MfaPendingSession,
  code: string
): Promise<{ kind: 'ticket'; ticket: string } | { kind: 'error'; error: string }> {
  const form = new URLSearchParams({
    'mfa-code': code.trim(),
    embed: 'true',
    _csrf: session.csrf,
    fromPage: 'setupEnterMfaCode',
  });
  const { html } = await ssoFetch(
    session.jar,
    `${SSO}/verifyMFA/loginEnterMfaCode?${SIGNIN_PARAMS}`,
    { method: 'POST', form }
  );
  const ticket = TICKET_RE.exec(html)?.[1];
  if (!ticket) {
    return { kind: 'error', error: 'MFA code rejected or session expired. Request a new code and reconnect.' };
  }
  return { kind: 'ticket', ticket };
}
