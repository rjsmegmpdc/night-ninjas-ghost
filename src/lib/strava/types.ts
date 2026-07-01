export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;            // ISO 8601 UTC
  start_date_local: string;      // ISO 8601 local
  distance: number;              // meters
  moving_time: number;           // seconds
  elapsed_time: number;          // seconds
  total_elevation_gain: number;  // meters
  average_speed: number;         // m/s
  max_speed: number;             // m/s
  average_heartrate?: number;
  max_heartrate?: number;
  suffer_score?: number;
  gear_id?: string;
}

export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;  // Unix timestamp (seconds)
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
  };
}

export interface StravaRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
