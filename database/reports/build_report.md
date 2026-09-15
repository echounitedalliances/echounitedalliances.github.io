# Echo United Alliances -- build report

Generated 2026-09-15 23:01 UTC by `database/scripts/build_database.py`.

## Row counts

| table | rows |
|---|---:|
| airlines | 583 |
| airports | 2,183 |
| aircraft_models | 79 |
| aircraft | 163,203 |
| flights | 346,198 |
| flight_assignments | 416,967 |
| airline_hubs | 3,312 |
| airline_stats | 69 |

## Data conditions handled

- 6,134 flights depart outside the 0-86399s day and were split into a time of day plus a signed day offset; the raw value is kept in `departure_daily_seconds_raw`.
- 110 aircraft have cabin ratios that do not sum to 1.0; they are loaded as exported and flagged by `v_aircraft_ratio_anomalies`.
- 4 individual cabin ratios carried float noise just outside [0,1] (worst: -1.37e-17) and were snapped to the boundary.

### fleet

- proxima/aeroflot: duplicate registration RA-76002 inside one fleet
- proxima/baja_signature: duplicate registration N667BS inside one fleet
- proxima/baja_signature: duplicate registration N444BS inside one fleet
- proxima/baja_signature: duplicate registration N761BS inside one fleet
- proxima/concordia_latam: duplicate registration XA-IKE inside one fleet
- proxima/concordia_latam: duplicate registration XA-VJI inside one fleet
- proxima/concordia_latam: duplicate registration XA-MPV inside one fleet
- proxima/concordia_latam: duplicate registration XA-VNH inside one fleet
- proxima/concordia_latam: duplicate registration XA-NFD inside one fleet
- proxima/concordia_latam: duplicate registration XA-TVS inside one fleet
- proxima/forza: duplicate registration VN-A287 inside one fleet
- proxima/pacific_airways: duplicate registration N694PA inside one fleet
- proxima/skyline_west: duplicate registration N244SW inside one fleet
- proxima/skyline_west: duplicate registration N279SW inside one fleet
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
- aura/sea_airways_my: duplicate registration 9M-KML inside one fleet
- aura/sea_airways_my: duplicate registration 9M-KML inside one fleet
- aura/sea_airways_my: duplicate registration 9M-KMK inside one fleet
- aura/sea_airways_my: duplicate registration 9M-KML inside one fleet
- aura/sea_airways_my: duplicate registration 9M-KMM inside one fleet
- aura/sea_airways_my: duplicate registration 9M-KMN inside one fleet
- aura/sea_airways_my: duplicate registration 9M-KMO inside one fleet
- ... and 194 more

### hubs

- 568 airlines had no hubAirports in their roster; their hubs were derived from the base airports of their fleet

### identity

- 583 airlines kept their carrier_code, 0 were assigned one; 401 of 583 carry a division-qualified code because the game code is shared or was once
- proxima/unknown_81846bbb: airline has no name in the export (uid 81846bbb-d6db-4c13-a507-7a1fd8df0cf8)

### livery

- 522 of 583 liveries yield a brand colour; the rest fly white and fall back to the division accent

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
- all 12471 stopover children resolve to a known flight

### stats

- member stats exist for 69 of 583 airlines (only Aegis exported members_stats.json)
