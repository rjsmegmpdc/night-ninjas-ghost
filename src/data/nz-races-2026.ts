// NZ half marathon & marathon calendar 2026–2027
// Source: runningcalendar.co.nz/calendar/ — scraped 2026-07-05
// Update annually. Only half (21.1 km) and full (42.195 km) distances included.
// Each event links back to the originating page so users can check details and register.
//
// url field: derived from event name via slug(). If the link 404s (slug mismatch),
// direct the user to searchUrl which opens a Google search for the event — they
// will find the correct page within the first result.

const BASE = 'https://www.runningcalendar.co.nz';

export interface NzRace {
  name: string;
  date: string;       // ISO 8601 YYYY-MM-DD
  city: string;
  distance_km: 21.1 | 42.195;
  url: string;        // runningcalendar.co.nz event page — primary link for registration/details
  searchUrl: string;  // Google search fallback — use if url returns a 404
}

// Derive event slug from name: lowercase, strip macrons, kebab-case
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[āâà]/g, 'a').replace(/[ēêè]/g, 'e').replace(/[īîì]/g, 'i')
    .replace(/[ōôò]/g, 'o').replace(/[ūûù]/g, 'u')
    .replace(/[™®'',.:]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function url(name: string): string {
  return `${BASE}/event/${slug(name)}/`;
}

function googleSearch(name: string, city: string): string {
  const q = encodeURIComponent(`${name} ${city} site:runningcalendar.co.nz OR "New Zealand"`);
  return `https://www.google.com/search?q=${q}`;
}

export const NZ_RACES: NzRace[] = [
  // ── July 2026 ──────────────────────────────────────────────────────────────
  { name: 'Nelson Marathon',                    date: '2026-07-11', city: 'Richmond, Nelson',                    distance_km: 42.195, url: url('Nelson Marathon'),                     searchUrl: googleSearch('Nelson Marathon',                    'Richmond, Nelson')                    },
  { name: 'Cape Egmont Half Marathon',          date: '2026-07-12', city: 'Okato, Taranaki',                    distance_km: 21.1,   url: url('Cape Egmont Half Marathon'),           searchUrl: googleSearch('Cape Egmont Half Marathon',          'Taranaki')                            },
  { name: 'Onehunga Half Marathon',             date: '2026-07-12', city: 'Onehunga, Auckland',                 distance_km: 21.1,   url: url('Onehunga Half Marathon'),              searchUrl: googleSearch('Onehunga Half Marathon',             'Auckland')                            },
  { name: 'Mackenzie Half Marathon',            date: '2026-07-18', city: 'Fairlie, South Canterbury',          distance_km: 21.1,   url: url('Mackenzie Half Marathon'),             searchUrl: googleSearch('Mackenzie Half Marathon',            'Fairlie')                             },
  { name: 'Whakatāne Bush Half Marathon',       date: '2026-07-18', city: 'Ōhope, Bay of Plenty',               distance_km: 21.1,   url: url('Whakatane Bush Half Marathon'),        searchUrl: googleSearch('Whakatane Bush Half Marathon',       'Bay of Plenty')                       },

  // ── August 2026 ────────────────────────────────────────────────────────────
  { name: 'Taupō Marathon',                     date: '2026-08-01', city: 'Taupō',                              distance_km: 42.195, url: url('Taupo Marathon'),                      searchUrl: googleSearch('Taupo Marathon',                     'Taupo')                               },
  { name: 'South Island Half Marathon',         date: '2026-08-02', city: 'Ashburton',                          distance_km: 21.1,   url: url('South Island Half Marathon'),          searchUrl: googleSearch('South Island Half Marathon',         'Ashburton')                           },
  { name: 'Tāmaki River Half Marathon',         date: '2026-08-02', city: 'Point England, Auckland',            distance_km: 21.1,   url: url('Tamaki River Half Marathon'),          searchUrl: googleSearch('Tamaki River Half Marathon',         'Auckland')                            },
  { name: 'Meridian Hydro Half Marathon',       date: '2026-08-08', city: 'Manapouri/Te Anau, Southland',       distance_km: 21.1,   url: url('Meridian Hydro Half Marathon'),        searchUrl: googleSearch('Meridian Hydro Half Marathon',       'Te Anau Southland')                   },
  { name: 'Woodbourne Half Marathon',           date: '2026-08-16', city: 'Blenheim',                           distance_km: 21.1,   url: url('Woodbourne Half Marathon'),            searchUrl: googleSearch('Woodbourne Half Marathon',           'Blenheim')                            },
  { name: 'Mount Maunganui Half Marathon',      date: '2026-08-29', city: 'Mount Maunganui',                    distance_km: 21.1,   url: url('Mount Maunganui Half Marathon'),       searchUrl: googleSearch('Mount Maunganui Half Marathon',      'Mount Maunganui')                     },
  { name: 'Lake Dunstan Trail Marathon',        date: '2026-08-30', city: 'Clyde to Cromwell, Otago',           distance_km: 42.195, url: url('Lake Dunstan Trail Marathon'),         searchUrl: googleSearch('Lake Dunstan Trail Marathon',        'Otago')                               },

  // ── September 2026 ─────────────────────────────────────────────────────────
  { name: 'North Shore Marathon',               date: '2026-09-06', city: 'Milford, Auckland',                  distance_km: 42.195, url: url('North Shore Marathon'),                searchUrl: googleSearch('North Shore Marathon',               'Auckland')                            },
  { name: "Emerson's Dunedin Marathon",         date: '2026-09-13', city: 'Dunedin',                            distance_km: 42.195, url: `${BASE}/event/emersons-dunedin-marathon/`, searchUrl: googleSearch("Emersons Dunedin Marathon",          'Dunedin')                             },
  { name: 'Whangārei Half Marathon',            date: '2026-09-13', city: 'Whangārei',                          distance_km: 21.1,   url: url('Whangarei Half Marathon'),             searchUrl: googleSearch('Whangarei Half Marathon',            'Whangarei')                           },
  { name: 'Cambridge Half Marathon',            date: '2026-09-20', city: 'Cambridge',                          distance_km: 21.1,   url: url('Cambridge Half Marathon'),             searchUrl: googleSearch('Cambridge Half Marathon',            'Cambridge New Zealand')               },
  { name: 'Hutt Half Marathon',                 date: '2026-09-20', city: 'Lower Hutt',                         distance_km: 21.1,   url: url('Hutt Half Marathon'),                  searchUrl: googleSearch('Hutt Half Marathon',                 'Lower Hutt')                          },
  { name: 'Sri Chinmoy Spring Half Marathon',   date: '2026-09-27', city: 'Christchurch',                       distance_km: 21.1,   url: url('Sri Chinmoy Spring Half Marathon'),    searchUrl: googleSearch('Sri Chinmoy Spring Half Marathon',   'Christchurch')                        },

  // ── October 2026 ───────────────────────────────────────────────────────────
  { name: 'Muriwai Half Marathon',              date: '2026-10-11', city: 'Muriwai, Auckland',                  distance_km: 21.1,   url: url('Muriwai Half Marathon'),               searchUrl: googleSearch('Muriwai Half Marathon',              'Auckland')                            },
  { name: 'Cromwell Half Marathon',             date: '2026-10-17', city: 'Cromwell, Central Otago',            distance_km: 21.1,   url: url('Cromwell Half Marathon'),              searchUrl: googleSearch('Cromwell Half Marathon',             'Central Otago')                       },
  { name: 'Hibiscus Half Marathon',             date: '2026-10-18', city: 'Hibiscus Coast, Auckland',           distance_km: 21.1,   url: url('Hibiscus Half Marathon'),              searchUrl: googleSearch('Hibiscus Half Marathon',             'Hibiscus Coast')                      },
  { name: 'Wairarapa Half Marathon',            date: '2026-10-18', city: 'Masterton',                          distance_km: 21.1,   url: url('Wairarapa Half Marathon'),             searchUrl: googleSearch('Wairarapa Half Marathon',            'Masterton')                           },
  { name: 'Gizzy Laser Half Marathon',          date: '2026-10-18', city: 'Gisborne',                           distance_km: 21.1,   url: url('Gizzy Laser Half Marathon'),           searchUrl: googleSearch('Gizzy Laser Half Marathon',          'Gisborne')                            },

  // ── November 2026 ──────────────────────────────────────────────────────────
  { name: 'Runaway Auckland Marathon',          date: '2026-11-01', city: 'Auckland',                           distance_km: 42.195, url: url('Runaway Auckland Marathon'),           searchUrl: googleSearch('Runaway Auckland Marathon',          'Auckland')                            },
  { name: 'Nelson Half Festival of Running',    date: '2026-11-01', city: 'Nelson',                             distance_km: 21.1,   url: url('Nelson Half Festival of Running'),     searchUrl: googleSearch('Nelson Half Festival of Running',    'Nelson')                              },
  { name: 'Lochmara Lodge Half Marathon',       date: '2026-11-07', city: 'Queen Charlotte Track, Marlborough', distance_km: 21.1,   url: url('Lochmara Lodge Half Marathon'),        searchUrl: googleSearch('Lochmara Lodge Half Marathon',       'Queen Charlotte Track')               },
  { name: 'Kāpiti Half Marathon',               date: '2026-11-08', city: 'Kāpiti Coast',                       distance_km: 21.1,   url: url('Kapiti Half Marathon'),                searchUrl: googleSearch('Kapiti Half Marathon',               'Kapiti Coast')                        },
  { name: 'Queenstown Marathon',                date: '2026-11-14', city: 'Queenstown',                         distance_km: 42.195, url: url('Queenstown Marathon'),                 searchUrl: googleSearch('Queenstown Marathon',                'Queenstown')                          },
  { name: 'Kerikeri Half Marathon',             date: '2026-11-21', city: 'Kerikeri, Northland',                distance_km: 21.1,   url: url('Kerikeri Half Marathon'),              searchUrl: googleSearch('Kerikeri Half Marathon',             'Northland')                           },
  { name: 'Hobsonville Half Marathon',          date: '2026-11-22', city: 'Hobsonville, Auckland',              distance_km: 21.1,   url: url('Hobsonville Half Marathon'),           searchUrl: googleSearch('Hobsonville Half Marathon',          'Auckland')                            },
  { name: 'Ōmaha Half Marathon',                date: '2026-11-29', city: 'Ōmaha, Auckland',                    distance_km: 21.1,   url: url('Omaha Half Marathon'),                 searchUrl: googleSearch('Omaha Half Marathon',                'Auckland')                            },

  // ── December 2026 ──────────────────────────────────────────────────────────
  { name: 'Whanganui 3 Bridges Marathon',       date: '2026-12-06', city: 'Whanganui',                          distance_km: 42.195, url: url('Whanganui 3 Bridges Marathon'),        searchUrl: googleSearch('Whanganui 3 Bridges Marathon',       'Whanganui')                           },
  { name: 'Canterbury Half Marathon',           date: '2026-12-13', city: 'Christchurch',                       distance_km: 21.1,   url: url('Canterbury Half Marathon'),            searchUrl: googleSearch('Canterbury Half Marathon',           'Christchurch')                        },

  // ── January 2027 ───────────────────────────────────────────────────────────
  { name: '8th Continent Half Marathon',        date: '2027-01-17', city: 'Auckland',                           distance_km: 21.1,   url: url('8th Continent Marathon Half Marathon'), searchUrl: googleSearch('8th Continent Marathon Half Marathon', 'Auckland')                           },
  { name: '8th Continent Marathon',             date: '2027-01-17', city: 'Auckland',                           distance_km: 42.195, url: url('8th Continent Marathon Half Marathon'), searchUrl: googleSearch('8th Continent Marathon',             'Auckland')                            },
  { name: 'First Light Marathon',               date: '2027-01-23', city: 'Gisborne',                           distance_km: 42.195, url: url('First Light Marathon'),                searchUrl: googleSearch('First Light Marathon',               'Gisborne')                            },
  { name: 'Mount Festival Half Marathon',       date: '2027-01-23', city: 'Mount Maunganui',                    distance_km: 21.1,   url: url('Mount Festival Half Marathon'),        searchUrl: googleSearch('Mount Festival Half Marathon',       'Mount Maunganui')                     },

  // ── February 2027 ──────────────────────────────────────────────────────────
  { name: 'Clevedon Half Marathon',             date: '2027-02-07', city: 'Clevedon, Auckland',                 distance_km: 21.1,   url: url('Clevedon Half Marathon'),              searchUrl: googleSearch('Clevedon Half Marathon',             'Auckland')                            },
  { name: 'Coatesville Half Marathon',          date: '2027-02-14', city: 'Coatesville, Auckland',              distance_km: 21.1,   url: url('Coatesville Half Marathon'),           searchUrl: googleSearch('Coatesville Half Marathon',          'Auckland')                            },
  { name: 'Christchurch Motorway Half Marathon',date: '2027-02-28', city: 'Christchurch',                       distance_km: 21.1,   url: url('Christchurch Motorway Half Marathon'),  searchUrl: googleSearch('Christchurch Motorway Half Marathon', 'Christchurch')                       },

  // ── March 2027 ─────────────────────────────────────────────────────────────
  { name: 'Hamilton Half Marathon',             date: '2027-03-14', city: 'Hamilton',                           distance_km: 21.1,   url: url('Hamilton Half Marathon'),              searchUrl: googleSearch('Hamilton Half Marathon',             'Hamilton New Zealand')                },
  { name: 'Maraetai Half Marathon',             date: '2027-03-14', city: 'Maraetai, Auckland',                 distance_km: 21.1,   url: url('Maraetai Half Marathon'),              searchUrl: googleSearch('Maraetai Half Marathon',             'Auckland')                            },
  { name: 'Middle-earth Halfling Marathon',     date: '2027-03-20', city: 'Matamata',                           distance_km: 21.1,   url: url('Middle-earth Halfling Marathon'),      searchUrl: googleSearch('Middle-earth Halfling Marathon',     'Matamata')                            },

  // ── April 2027 ─────────────────────────────────────────────────────────────
  { name: 'Christchurch Marathon',              date: '2027-04-18', city: 'Christchurch',                       distance_km: 42.195, url: url('Christchurch Marathon'),               searchUrl: googleSearch('Christchurch Marathon',              'Christchurch')                        },

  // ── May 2027 ───────────────────────────────────────────────────────────────
  { name: 'Hanmer Half Marathon',               date: '2027-05-01', city: 'Hanmer Springs, Canterbury',         distance_km: 21.1,   url: url('Hanmer Half Marathon'),                searchUrl: googleSearch('Hanmer Half Marathon',               'Hanmer Springs')                      },
  { name: 'Rotorua Marathon',                   date: '2027-05-01', city: 'Rotorua',                            distance_km: 42.195, url: url('Rotorua Marathon'),                    searchUrl: googleSearch('Rotorua Marathon',                   'Rotorua')                             },
  { name: 'Saint Clair Vineyard Half Marathon', date: '2027-05-08', city: 'Blenheim, Marlborough',              distance_km: 21.1,   url: url('Saint Clair Vineyard Half Marathon'),  searchUrl: googleSearch('Saint Clair Vineyard Half Marathon', 'Marlborough')                        },
  { name: "ASICS Runaway Hawke's Bay Marathon", date: '2027-05-15', city: "Napier, Hawke's Bay",                distance_km: 42.195, url: url('ASICS Runaway Hawkes Bay Marathon'),   searchUrl: googleSearch("ASICS Runaway Hawkes Bay Marathon",  "Napier")                             },

  // ── June 2027 ──────────────────────────────────────────────────────────────
  { name: 'Selwyn Marathon',                    date: '2027-06-06', city: 'Lincoln, Canterbury',                distance_km: 42.195, url: url('Selwyn Marathon'),                     searchUrl: googleSearch('Selwyn Marathon',                    'Lincoln Canterbury')                  },
];

export const NZ_HALF_MARATHONS = NZ_RACES.filter((r) => r.distance_km === 21.1);
export const NZ_MARATHONS      = NZ_RACES.filter((r) => r.distance_km === 42.195);
