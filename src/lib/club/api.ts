/**
 * Club datastore client — talks to the oauth-worker's /club endpoints.
 * Reads are public; writes require an Access JWT from an allowlisted
 * admin email (same email-code flow as Profile Sync).
 */

const WORKER_URL = import.meta.env.VITE_STRAVA_OAUTH_WORKER as string | undefined ?? '';

export interface ClubMember {
  id: number;
  name: string;
  sex: 'M' | 'F';
  yob: number | null;
}

export interface ClubResultRow {
  id: number;
  member_id: number;
  course: string;
  date: string;
  time_s: number;
  name: string;
  sex: 'M' | 'F';
  yob: number | null;
}

export interface ClubChampsRow {
  id: number;
  member_id: number;
  year: number;
  pb5k_s: number | null;
  pb10k_s: number | null;
  pb21k_s: number | null;
  actual_s: number | null;
  name: string;
  sex: 'M' | 'F';
  yob: number | null;
}

export interface ClubWinnerRow {
  year: number;
  name: string;
  note: string | null;
}

export interface ClubData {
  members: ClubMember[];
  results: ClubResultRow[];
  champsEntries: ClubChampsRow[];
  champsWinners: ClubWinnerRow[];
}

export class ClubNotConfiguredError extends Error {
  constructor() {
    super('Club datastore not configured on this deployment');
    this.name = 'ClubNotConfiguredError';
  }
}

export async function fetchClubData(): Promise<ClubData> {
  const res = await fetch(`${WORKER_URL}/club/data`);
  if (res.status === 501) throw new ClubNotConfiguredError();
  if (!res.ok) throw new Error(`Club data fetch failed (${res.status})`);
  return res.json() as Promise<ClubData>;
}

// ---------------------------------------------------------------------------
// Admin auth — reuses the Access-protected /sync/start handoff, returning to
// /club instead of /setup. The JWT lands in the URL fragment.
// ---------------------------------------------------------------------------

export function startClubAdminAuth(): void {
  const returnTo = encodeURIComponent(`${window.location.origin}/club`);
  window.location.href = `${WORKER_URL}/sync/start?return_to=${returnTo}`;
}

/** Call on /club mount — captures a returning Access JWT from the fragment. */
export function captureClubAdminToken(): boolean {
  const match = window.location.hash.match(/sync_token=([^&]+)/);
  if (!match) return false;
  sessionStorage.setItem('ghost.sync_jwt', match[1]);
  sessionStorage.setItem('ghost.club_admin', '1');
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
}

export function hasClubAdminSession(): boolean {
  return sessionStorage.getItem('ghost.club_admin') === '1'
    && !!sessionStorage.getItem('ghost.sync_jwt');
}

export function endClubAdminSession(): void {
  sessionStorage.removeItem('ghost.club_admin');
}

function authHeaders(): Record<string, string> {
  const jwt = sessionStorage.getItem('ghost.sync_jwt');
  if (!jwt) throw new Error('Admin session expired — tap Admin to sign in again');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` };
}

async function post(path: string, body: unknown): Promise<{ id?: number }> {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('Admin session expired — tap Admin to sign in again');
  if (res.status === 403) throw new Error('This email is not a club admin');
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Save failed (${res.status}): ${msg}`);
  }
  return res.json() as Promise<{ id?: number }>;
}

export async function addMember(m: { name: string; sex: 'M' | 'F'; yob: number | null }): Promise<number> {
  const { id } = await post('/club/member', m);
  return id!;
}

export async function addResult(r: { memberId: number; course: string; date: string; timeS: number }): Promise<void> {
  await post('/club/result', r);
}

export async function upsertChampsEntry(e: {
  memberId: number; year: number;
  pb5kS: number | null; pb10kS: number | null; pb21kS: number | null; actualS: number | null;
}): Promise<void> {
  await post('/club/champs-entry', e);
}

export async function setWinner(w: { year: number; name: string; note?: string | null }): Promise<void> {
  await post('/club/winner', w);
}

async function del(path: string, id: number): Promise<void> {
  const res = await fetch(`${WORKER_URL}${path}?id=${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

export const deleteResult = (id: number) => del('/club/result', id);
export const deleteChampsEntry = (id: number) => del('/club/champs-entry', id);
