# Echo United Alliances -- build report

Generated 2026-10-05 19:23 UTC by `database/scripts/build_database.py`.

## Row counts

| table | rows |
|---|---:|
| airlines | 644 |
| airports | 2,192 |
| aircraft_models | 79 |
| aircraft | 213,372 |
| flights | 376,650 |
| flight_assignments | 481,967 |
| airline_hubs | 3,483 |
| airline_stats | 53 |

## Data conditions handled

- 7,216 flights depart outside the 0-86399s day and were split into a time of day plus a signed day offset (the raw value is `departure_day_offset * 86400 + departure_daily_seconds`).
- 35 aircraft have cabin ratios that do not sum to 1.0; they are loaded as exported and flagged by `v_aircraft_ratio_anomalies`.
- 4 individual cabin ratios carried float noise just outside [0,1] (worst: -1.37e-17) and were snapped to the boundary.

### fleet

- proxima/aeroflot: duplicate registration RA-76002 inside one fleet
- proxima/baja_signature: duplicate registration N667BS inside one fleet
- proxima/baja_signature: duplicate registration N444BS inside one fleet
- proxima/baja_signature: duplicate registration N761BS inside one fleet
- proxima/forza: duplicate registration VN-A287 inside one fleet
- proxima/skyline_west: duplicate registration N244SW inside one fleet
- proxima/skyline_west: duplicate registration N279SW inside one fleet
- aegis/airnara_tg: duplicate registration JA422N inside one fleet
- aegis/baja_premium: duplicate registration N760DP inside one fleet
- aegis/baja_premium: duplicate registration N440DP inside one fleet
- aegis/era_airlines: duplicate registration N994ER inside one fleet
- aegis/era_airlines: duplicate registration N135ER inside one fleet
- aegis/era_airlines: duplicate registration N999ER inside one fleet
- aegis/fly_moon: duplicate registration D-NZWX inside one fleet
- aegis/fly_moon: duplicate registration D-NZXD inside one fleet
- aegis/fly_moon: duplicate registration D-NZXE inside one fleet
- aegis/fly_moon: duplicate registration D-NZXF inside one fleet
- aegis/fly_moon: duplicate registration D-NZXG inside one fleet
- aegis/fly_moon: duplicate registration D-NZXH inside one fleet
- aegis/fly_moon: duplicate registration D-NZXD inside one fleet
- aegis/fly_moon: duplicate registration D-NZXE inside one fleet
- aegis/fly_moon: duplicate registration D-NZXF inside one fleet
- aegis/fly_moon: duplicate registration D-NZXG inside one fleet
- aegis/fly_moon: duplicate registration D-NZXH inside one fleet
- aegis/fly_moon: duplicate registration D-NZXI inside one fleet
- aegis/fly_moon: duplicate registration D-NZXI inside one fleet
- aegis/fly_moon: duplicate registration D-NZXJ inside one fleet
- aegis/fly_moon: duplicate registration D-NZXK inside one fleet
- aegis/fly_moon: duplicate registration D-NZXL inside one fleet
- aegis/fly_moon: duplicate registration D-NZXD inside one fleet
- aegis/fly_moon: duplicate registration D-NZXE inside one fleet
- aegis/fly_moon: duplicate registration D-NZXF inside one fleet
- aegis/fly_moon: duplicate registration D-NZXG inside one fleet
- aegis/fly_moon: duplicate registration D-NZXH inside one fleet
- aegis/fly_moon: duplicate registration D-NZXI inside one fleet
- aegis/fly_moon: duplicate registration D-NZXJ inside one fleet
- aegis/fly_moon: duplicate registration D-NZXK inside one fleet
- aegis/fly_moon: duplicate registration D-NZXL inside one fleet
- aegis/fly_moon: duplicate registration D-NZXD inside one fleet
- aegis/fly_moon: duplicate registration D-NZXE inside one fleet
- ... and 278 more

### hubs

- 626 airlines had no hubAirports in their roster; their hubs were derived from the base airports of their fleet

### identity

- 633 airlines kept their carrier_code, 11 were assigned one; 434 of 644 carry a division-qualified code because the game code is shared or was once
- proxima/unknown_81846bbb: airline has no name in the export (uid 81846bbb-d6db-4c13-a507-7a1fd8df0cf8)

### livery

- 580 of 644 liveries yield a brand colour; the rest fly white and fall back to the division accent

### roster

- proxima: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- aegis: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- aura: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- elion: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- elysium: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- kyra: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- rhea: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- vilis: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- eos: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases

### schedule

- 40 (airline, flight number, origin, destination) combinations appear on more than one flight_id - players may file the same number twice, so that tuple is indexed but not unique
- all 11976 stopover children resolve to a known flight
- 10,189 routes are opened in the game with no flight on them (airline_unflown_routes); they count as routes, nothing sells

### stats

- member stats exist for 53 of 644 airlines (only Aegis exported members_stats.json)
