# Airport backfill report

Sources: OurAirports (name, city, country, coordinates) and mwgg/Airports
(IANA timezone). Merged into `database/reference/airports_reference.json`.

| metric | value |
|---|---:|
| airports in the network | 2215 |
| resolved to a real airport | 2215 |
| with coordinates | 2215 |
| with an IANA timezone | 2215 |
| timezone from a dataset | 2166 |
| timezone inferred from country | 44 |
| still without a timezone | 0 |
| still unnamed | 0 |

Airports without a timezone render departure times exactly as the game
stores them; everything else can be shown in real local time.
