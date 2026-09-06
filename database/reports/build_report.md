# Echo United Alliances -- build report

Generated 2026-09-06 23:07 UTC by `database/scripts/build_database.py`.

## Row counts

| table | rows |
|---|---:|
| airlines | 602 |
| airports | 2,187 |
| aircraft_models | 79 |
| aircraft | 157,000 |
| flights | 345,941 |
| flight_assignments | 416,290 |
| airline_hubs | 3,313 |
| airline_stats | 78 |

## Data conditions handled

- 5,729 flights depart outside the 0-86399s day and were split into a time of day plus a signed day offset; the raw value is kept in `departure_daily_seconds_raw`.
- 131 aircraft have cabin ratios that do not sum to 1.0; they are loaded as exported and flagged by `v_aircraft_ratio_anomalies`.
- 16 individual cabin ratios carried float noise just outside [0,1] (worst: -1.37e-17) and were snapped to the boundary.

### fleet

- proxima/aeroflot: duplicate registration RA-76002 inside one fleet
- proxima/baja_signature: duplicate registration N667BS inside one fleet
- proxima/baja_signature: duplicate registration N444BS inside one fleet
- proxima/baja_signature: duplicate registration N761BS inside one fleet
- proxima/forza: duplicate registration VN-A287 inside one fleet
- proxima/pacific_airways: duplicate registration N694PA inside one fleet
- proxima/skyline_west: duplicate registration N244SW inside one fleet
- proxima/skyline_west: duplicate registration N279SW inside one fleet
- proxima/wondr: duplicate registration A6-JED inside one fleet
- proxima/xplora: duplicate registration N692XR inside one fleet
- proxima/xplora: duplicate registration N758XR inside one fleet
- proxima/xplora: duplicate registration N718XR inside one fleet
- proxima/xplora: duplicate registration N430XR inside one fleet
- proxima/xplora: duplicate registration N824XR inside one fleet
- proxima/xplora: duplicate registration N166XR inside one fleet
- proxima/xplora: duplicate registration N225XR inside one fleet
- proxima/xplora: duplicate registration N695XR inside one fleet
- proxima/xplora: duplicate registration N923XR inside one fleet
- aegis/aero_riwa: duplicate registration JA653A inside one fleet
- aegis/aero_riwa: duplicate registration JA611A inside one fleet
- aegis/air_global: duplicate registration G-GHWT inside one fleet
- aegis/air_global: duplicate registration G-GHWU inside one fleet
- aegis/air_global: duplicate registration G-GHWV inside one fleet
- aegis/air_global: duplicate registration G-GHWW inside one fleet
- aegis/air_global: duplicate registration G-GHWX inside one fleet
- aegis/airnara_tg: duplicate registration JA422N inside one fleet
- aegis/baja_premium: duplicate registration N760DP inside one fleet
- aegis/baja_premium: duplicate registration N440DP inside one fleet
- aegis/egypt_airlines: duplicate registration SU-LLR inside one fleet
- aegis/egypt_airlines: duplicate registration SU-UJW inside one fleet
- aegis/egypt_airlines: duplicate registration SU-NUF inside one fleet
- aegis/era_airlines: duplicate registration N994ER inside one fleet
- aegis/era_airlines: duplicate registration N999ER inside one fleet
- aegis/era_airlines: duplicate registration N135ER inside one fleet
- aegis/mikeria: duplicate registration N349MI inside one fleet
- aura/sea_airways_my: duplicate registration 9M-KML inside one fleet
- aura/sea_airways_my: duplicate registration 9M-KML inside one fleet
- aura/sea_airways_my: duplicate registration 9M-KMM inside one fleet
- aura/sea_airways_my: duplicate registration 9M-KMN inside one fleet
- aura/sea_airways_my: duplicate registration 9M-KMO inside one fleet
- ... and 192 more

### hubs

- 586 airlines had no hubAirports in their roster; their hubs were derived from the base airports of their fleet

### identity

- 411 of 602 airlines needed a division-qualified carrier_code because the game code is shared
- proxima/unknown_81846bbb: airline has no name in the export (uid 81846bbb-d6db-4c13-a507-7a1fd8df0cf8)

### livery

- 537 of 602 liveries yield a brand colour; the rest fly white and fall back to the division accent

### roster

- proxima: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- aegis: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- aura: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- elion: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- elysium: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- kyra: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- rhea: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases
- vilis: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases

### schedule

- 36 (airline, flight number, origin, destination) combinations appear on more than one flight_id - players may file the same number twice, so that tuple is indexed but not unique
- all 13358 stopover children resolve to a known flight

### stats

- member stats exist for 78 of 602 airlines (only Aegis exported members_stats.json)
