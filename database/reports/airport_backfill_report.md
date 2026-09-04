# Airport backfill report

Sources: OurAirports (name, city, country, coordinates) and mwgg/Airports
(IANA timezone). Merged into `database/reference/airports_reference.json`.

| metric | value |
|---|---:|
| airports in the network | 2187 |
| resolved to a real airport | 2186 |
| with coordinates | 2186 |
| with an IANA timezone | 2175 |
| timezone from a dataset | 2140 |
| timezone inferred from country | 35 |
| still without a timezone | 12 |
| still unnamed | 1 |

Airports without a timezone render departure times exactly as the game
stores them; everything else can be shown in real local time.

## Unresolved codes

Not present in either open dataset - most likely airports the game
invented, or codes retired from the real world.

`PXN`

## Without a timezone

`BWX`, `CUK`, `DEX`, `DHX`, `DRV`, `GGR`, `MOH`, `MRA`, `PLJ`, `PXN`, `SPR`, `WHB`
