# The Airline Simulator server API

How Echo's data is scraped, and what the game's server will tell you.

> **Never paste a bearer token into this file.** It is committed to a public
> repository — a token pasted here is published the moment it is pushed, and it
> stays in the git history afterwards. That happened once already, on
> 7 September 2026.
>
> Put the token in **`divisions/.token`** instead. That path is gitignored, and
> it is what `scrape_members.py` actually reads. Or export `TAS_JWT`.
>
> Tokens last about an hour, so capture one immediately before a scrape.

# File structure:
(root)
- divisions
-- aegis
-- proxima
--- members
- socials

# Task: 
- Under Proxima's "members" subfolder, open members.json, which contains a list of members to extract info from. Each member has a unique Id, called uid in this game system. From members.json, use leaderUid and allianceMemberUidList as a full uid list of airlines of the alliance. 

- For each uid in the list:
- Run the POST Query C below with the follow up data also provided. Take airlineName and use the return value to make a new subfolder under /members. This subfolder contains information about each airline under a particular alliance. Use airlineName, airlineCode, and airlineCountry to fill in an info.json file (example: /members/vaultera/info.json).
- Then run the GET Query A below with the follow up data also provided. Take the JSON response and put it directly into a new file flights.json for that specific airline.
- Then run the GET Query B below with the follow up data provided. Take the JSON response and put directly into a new file aircrafts.json for that specific airline.

## query A - airline's flights
GET https://urmwaqnhesasfaeprcga-all.supabase.co/rest/v1/new_player_flight_data?select=*&uid=eq.d478024d-9da7-4bb2-a98e-c4d42b87f6e2 HTTP/2.0
accept: */*
apikey: sb_publishable_zGtQpUELNKHPluSkfQ9FOw__BXFJVlf
authorization: Bearer <BEARER_TOKEN>
accept-profile: public
accept-encoding: gzip, deflate, br
x-client-info: supabase-js-react-native/2.76.1
user-agent: AirlineSimulator/293 CFNetwork/3860.700.1 Darwin/25.6.0
priority: u=3, i
accept-language: en-GB,en;q=0.9


## query B - airline's aircrafts
GET https://urmwaqnhesasfaeprcga-all.supabase.co/rest/v1/player_aircraft_data?select=*&uid=eq.d478024d-9da7-4bb2-a98e-c4d42b87f6e2 HTTP/2.0
accept: */*
apikey: sb_publishable_zGtQpUELNKHPluSkfQ9FOw__BXFJVlf
authorization: Bearer <BEARER_TOKEN>
accept-profile: public
accept-encoding: gzip, deflate, br
x-client-info: supabase-js-react-native/2.76.1
user-agent: AirlineSimulator/293 CFNetwork/3860.700.1 Darwin/25.6.0
priority: u=3, i
accept-language: en-GB,en;q=0.9

## query C - airline's name, code, country
POST https://urmwaqnhesasfaeprcga-all.supabase.co/rest/v1/rpc/get_player_by_uid HTTP/2.0
content-type: application/json
accept: */*
authorization: Bearer <BEARER_TOKEN>
priority: u=3, i
accept-language: en-GB,en;q=0.9
accept-encoding: gzip, deflate, br
apikey: sb_publishable_zGtQpUELNKHPluSkfQ9FOw__BXFJVlf
user-agent: AirlineSimulator/293 CFNetwork/3860.700.1 Darwin/25.6.0
x-client-info: supabase-js-react-native/2.76.1
content-profile: public
content-length: 48

When sending this POST command, the JSON payload is
{
    "p_uid": "the uid of the airline in the list"
}

Look for fields "airlineName", "airlineCode", "airlineCountry" in response

---

# Queries D-F: found by probing the server, 7 September 2026

The three queries above are enough to scrape an alliance you already have a
roster for. These are the ones that make the scrape *correct*.

`GET /rest/v1/` is not usable for discovery — it answers "Secret API key
required" for a publishable key — so the surface below was found by probing
names. Only these are exposed: `new_player_flight_data`, `player_aircraft_data`,
`player_livery_config`, `alliance`, and the `get_player_by_uid` RPC.

## query D - an alliance's CURRENT membership  (the important one)

```
GET /rest/v1/alliance?select=*&allianceName=eq.Echo%20Elysium
```
Same headers as query A.

Returns **`allianceMemberUidList`** and `leaderUid` — the live roster — plus
`allianceName`, `allianceDescription`, `allianceType`, `allianceLogo`,
`allianceLogoColor`, `createdTime`, `allianceTag`, `socialLink`,
`memberJoinTimes`.

**Use this instead of a saved members.json.** A roster on disk is a photograph.
On 7 September the eight Echo rosters had drifted from the saved files by 18
joins, 6 departures and 4 rebrands: Essequibo Air had joined Elysium and was
missing entirely, while one uid had renamed itself from ScotJet XPlore to GenZ
Air Lines *and* moved to Aura, yet still showed in Elysium under the old name.

`allianceName=ilike.*echo*` finds all eight at once, but it also matches
unrelated alliances (Czechoslovak Club, RoyaltyEchoes), so match exactly.

## query E - an airline's livery, the closest thing to a logo

```
GET /rest/v1/player_livery_config?select=*&uid=eq.<uid>
```

**There is no logo image anywhere in this API.** An airline's identity is a
livery: `fuselageColor`, `tailColor`, `wingletColor`, `engineColor`, a
`layerColors` array of named sections, and a chosen tail mark
(`tailLogoType`, `tailLogoId`, `tailLogoColor`). The client draws the aircraft
from these; there is no bitmap to fetch.

Batch it: `uid=in.(uid1,uid2,...)` takes about 60 uids per request, so all 602
airlines arrive in ten calls.

## query F - identity, always

`get_player_by_uid` (query C) is the **only** trustworthy source of an
airline's name, code and country — never take them from a roster. It returns
nothing for a deleted account, which is how you detect one.

## Notes on the data

- **`turnaroundOffset` is in QUARTER HOURS, not minutes**, on top of a fixed
  60-minute turnaround: ground time = `60 + turnaroundOffset * 15`. 91.4% of
  flights have offset 0, where "minutes floored at 60" gives the same answer —
  which is why reading it as minutes looked right almost everywhere and
  silently corrupted the other 8.6%.
- `flightId` is stable: across two days 99.1% of scraped rows were still there,
  so a vanished flightId means the player really deleted it.
- A plain select is capped at 1000 rows and does not say so. Filter
  server-side.
