# Airport backfill report

Sources: OurAirports (name, city, country, coordinates) and mwgg/Airports
(IANA timezone). Merged into `database/reference/airports_reference.json`.

| metric | value |
|---|---:|
| airports in the network | 2181 |
| resolved to a real airport | 2181 |
| with coordinates | 2181 |
| with an IANA timezone | 2181 |
| timezone from a dataset | 2133 |
| timezone inferred from country | 43 |
| still without a timezone | 0 |
| still unnamed | 0 |

Airports without a timezone render departure times exactly as the game
stores them; everything else can be shown in real local time.
