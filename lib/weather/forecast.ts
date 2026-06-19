import 'server-only';

/**
 * Open-Meteo daily forecast - read layer.
 *
 * Server-only reader for the keyless Open-Meteo Forecast API
 * (https://api.open-meteo.com/v1/forecast). No API key is required for
 * free / non-commercial use. Uses the global fetch (Node 20 / Next 15).
 *
 * Returns a normalised DayForecast[] aligned to the API's parallel daily
 * arrays. Defaults to Auckland NZ (the goal-race venue) since the app
 * stores no per-race location today.
 *
 * Race-day humidity note: the API exposes NO daily relative-humidity
 * aggregate - relative_humidity_2m exists only at current/hourly
 * resolution. We request it under `current=` and apply that single
 * "now" value to every day as a best-effort fill; it is not a per-day
 * forecast and callers should treat it as ambient context only.
 *
 * Degrades gracefully: any network failure, non-ok response, error body,
 * timeout, or shape mismatch resolves to [] (getDailyForecast) or null
 * (getForecastForDate) rather than throwing - several runtimes have no
 * outbound network.
 */

/** Auckland NZ - goal-race default when no location is stored. */
const DEFAULT_LAT = -36.8485;
const DEFAULT_LON = 174.7633;

/** Open-Meteo free-tier forecast_days max is 16; default to a ~14 day window. */
const DEFAULT_DAYS = 14;
const MAX_FORECAST_DAYS = 16;

/** Short timeout - forecasts must never block a server render. */
const FETCH_TIMEOUT_MS = 8000;

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

const DAILY_PARAMS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'precipitation_probability_max',
  'precipitation_sum',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'weather_code',
] as const;

// relative_humidity_2m has NO daily aggregate - only current/hourly. We pull
// it from `current=` and reuse the single value as best-effort daily fill.
const CURRENT_PARAMS = ['relative_humidity_2m'] as const;

export interface DayForecast {
  /** Local-time ISO date "YYYY-MM-DD" (timezone=auto resolves to venue local). */
  dateIso: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  apparentTempMaxC: number | null;
  /** Ambient "now" humidity from current.relative_humidity_2m - not per-day. */
  humidityPct: number | null;
  precipProbPct: number | null;
  windMaxKmh: number | null;
}

/** Minimal shape of the bits of the Open-Meteo response we consume. */
interface OpenMeteoResponse {
  error?: boolean;
  reason?: string;
  current?: {
    relative_humidity_2m?: number | null;
  } | null;
  daily?: {
    time?: unknown;
    temperature_2m_max?: unknown;
    temperature_2m_min?: unknown;
    apparent_temperature_max?: unknown;
    precipitation_probability_max?: unknown;
    wind_speed_10m_max?: unknown;
  } | null;
}

/** Coerce an unknown array element to a finite number or null. */
function numAt(arr: unknown, i: number): number | null {
  if (!Array.isArray(arr)) return null;
  const v = arr[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function clampDays(days: number | undefined): number {
  if (typeof days !== 'number' || !Number.isFinite(days)) return DEFAULT_DAYS;
  const d = Math.floor(days);
  if (d < 1) return 1;
  if (d > MAX_FORECAST_DAYS) return MAX_FORECAST_DAYS;
  return d;
}

function buildUrl(lat: number, lon: number, days: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: DAILY_PARAMS.join(','),
    current: CURRENT_PARAMS.join(','),
    timezone: 'auto',
    forecast_days: String(days),
  });
  return `${BASE_URL}?${params.toString()}`;
}

/**
 * Fetch the daily forecast and map the parallel arrays to DayForecast[].
 * Defaults to Auckland NZ and a ~14 day window. Returns [] on any failure.
 */
export async function getDailyForecast(opts?: {
  lat?: number;
  lon?: number;
  days?: number;
}): Promise<DayForecast[]> {
  const lat = typeof opts?.lat === 'number' && Number.isFinite(opts.lat) ? opts.lat : DEFAULT_LAT;
  const lon = typeof opts?.lon === 'number' && Number.isFinite(opts.lon) ? opts.lon : DEFAULT_LON;
  const days = clampDays(opts?.days);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(buildUrl(lat, lon, days), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as OpenMeteoResponse;
    // Open-Meteo signals validation errors with { error: true, reason }.
    if (data.error) return [];

    const daily = data.daily;
    const time = daily?.time;
    if (!Array.isArray(time) || time.length === 0) return [];

    // Single ambient humidity value reused across days (no daily aggregate).
    const humidityNow =
      typeof data.current?.relative_humidity_2m === 'number' &&
      Number.isFinite(data.current.relative_humidity_2m)
        ? data.current.relative_humidity_2m
        : null;

    const out: DayForecast[] = [];
    for (let i = 0; i < time.length; i++) {
      const dateIso = time[i];
      if (typeof dateIso !== 'string') continue;
      out.push({
        dateIso,
        tempMaxC: numAt(daily?.temperature_2m_max, i),
        tempMinC: numAt(daily?.temperature_2m_min, i),
        apparentTempMaxC: numAt(daily?.apparent_temperature_max, i),
        humidityPct: humidityNow,
        precipProbPct: numAt(daily?.precipitation_probability_max, i),
        windMaxKmh: numAt(daily?.wind_speed_10m_max, i),
      });
    }
    return out;
  } catch {
    // Network unavailable, abort/timeout, JSON parse failure, etc.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Return the forecast for a specific local date ("YYYY-MM-DD") if it falls
 * within the available forecast window, else null. Normalises the input to
 * the date portion so a full ISO timestamp ("...T09:00") also matches.
 */
export async function getForecastForDate(
  dateIso: string,
  opts?: { lat?: number; lon?: number },
): Promise<DayForecast | null> {
  if (typeof dateIso !== 'string' || dateIso.length < 10) return null;
  const targetDay = dateIso.slice(0, 10);

  const forecast = await getDailyForecast({ lat: opts?.lat, lon: opts?.lon, days: MAX_FORECAST_DAYS });
  return forecast.find((d) => d.dateIso === targetDay) ?? null;
}
