# Echo United Alliances -- build report

Generated 2026-11-27 22:40 UTC by `database/scripts/build_database.py`.

## Row counts

| table | rows |
|---|---:|
| airlines | 757 |
| airports | 2,216 |
| aircraft_models | 79 |
| aircraft | 280,453 |
| flights | 528,814 |
| flight_assignments | 719,056 |
| airline_hubs | 4,483 |
| airline_stats | 42 |

## Data conditions handled

- 8,799 flights depart outside the 0-86399s day and were split into a time of day plus a signed day offset (the raw value is `departure_day_offset * 86400 + departure_daily_seconds`).
- 0 aircraft have cabin ratios that do not sum to 1.0; they are loaded as exported and flagged by `v_aircraft_ratio_anomalies`.
- 0 individual cabin ratios carried float noise just outside [0,1] (worst: -1.37e-17) and were snapped to the boundary.

### fleet

- proxima/baja_signature: duplicate registration N667BS inside one fleet
- proxima/baja_signature: duplicate registration N444BS inside one fleet
- proxima/baja_signature: duplicate registration N761BS inside one fleet
- proxima/californian_air: duplicate registration N386CA inside one fleet
- proxima/forza: duplicate registration VN-A287 inside one fleet
- proxima/skyline_west: duplicate registration N244SW inside one fleet
- proxima/skyline_west: duplicate registration N279SW inside one fleet
- aegis/airnara_tg: duplicate registration JA422N inside one fleet
- aegis/aéroquébec: duplicate registration C-SLQG inside one fleet
- aegis/aéroquébec: duplicate registration C-SLQH inside one fleet
- aegis/baja_premium: duplicate registration N760DP inside one fleet
- aegis/baja_premium: duplicate registration N440DP inside one fleet
- aegis/era_airlines: duplicate registration N994ER inside one fleet
- aegis/era_airlines: duplicate registration N135ER inside one fleet
- aegis/era_airlines: duplicate registration N999ER inside one fleet
- aegis/mikeria: duplicate registration N349MI inside one fleet
- aegis/networkafrica: duplicate registration 5N-ABF inside one fleet
- aegis/networkafrica: duplicate registration 5N-ABK inside one fleet
- aegis/networkafrica: duplicate registration 5N-ABR inside one fleet
- aegis/networkafrica: duplicate registration 5N-AAV inside one fleet
- aegis/networkafrica: duplicate registration 5N-AAY inside one fleet
- aegis/networkafrica: duplicate registration 5N-ABJ inside one fleet
- aegis/networkafrica: duplicate registration 5N-AAZ inside one fleet
- aegis/networkafrica: duplicate registration 5N-ABM inside one fleet
- aegis/nouvelleair: duplicate registration N633NA inside one fleet
- aegis/nouvelleair: duplicate registration N477NA inside one fleet
- aegis/nouvelleair: duplicate registration N148NA inside one fleet
- aegis/nouvelleair: duplicate registration N746NA inside one fleet
- aegis/nouvelleair: duplicate registration N425NA inside one fleet
- aegis/nouvelleair: duplicate registration N596NA inside one fleet
- aegis/nouvelleair: duplicate registration N507NA inside one fleet
- aegis/nouvelleair: duplicate registration N481NA inside one fleet
- aegis/nouvelleair: duplicate registration N467NA inside one fleet
- aegis/nouvelleair: duplicate registration N527NA inside one fleet
- aegis/nouvelleair: duplicate registration N652NA inside one fleet
- aegis/nouvelleair: duplicate registration N412NA inside one fleet
- aegis/nouvelleair: duplicate registration N728NA inside one fleet
- aegis/nouvelleair: duplicate registration N734NA inside one fleet
- aegis/nouvelleair: duplicate registration N607NA inside one fleet
- aegis/nouvelleair: duplicate registration N397NA inside one fleet
- ... and 259 more

### hubs

- 744 airlines had no hubAirports in their roster; their hubs were derived from the base airports of their fleet

### identity

- 716 airlines kept their carrier_code, 41 were assigned one; 516 of 757 carry a division-qualified code because the game code is shared or was once
- proxima/unknown_81846bbb: airline has no name in the export (uid 81846bbb-d6db-4c13-a507-7a1fd8df0cf8)

### livery

- 670 of 757 liveries yield a brand colour; the rest fly white and fall back to the division accent

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
- uzuri: alliance-object roster - no hubAirports or airlineId for its members; hubs are derived from fleet bases

### schedule

- 69 (airline, flight number, origin, destination) combinations appear on more than one flight_id - players may file the same number twice, so that tuple is indexed but not unique
- all 17305 stopover children resolve to a known flight
- 9,154 routes are opened in the game with no flight on them (airline_unflown_routes); they count as routes, nothing sells

### stats

- member stats exist for 42 of 757 airlines (only Aegis exported members_stats.json)
