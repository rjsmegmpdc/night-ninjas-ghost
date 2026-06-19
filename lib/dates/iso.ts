/**
 * UTC-anchored ISO date arithmetic.
 *
 * Constructing a Date from 'YYYY-MM-DDT00:00:00' (no zone) parses as LOCAL
 * time; reading it back via toISOString() (UTC) then shifts the calendar day
 * by one on any machine east of Greenwich (NZ is UTC+12). Anchoring both ends
 * to UTC keeps the arithmetic independent of the machine timezone. This is the
 * single source of truth - prefer it over hand-rolled `new Date(iso + 'T...')`.
 */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
