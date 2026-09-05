#!/usr/bin/env python3
"""Echo United Alliances -- JSON exports to relational CSV.

Reads divisions/<division>/members.json plus every
divisions/<division>/members/<airline>/{info,flights,aircrafts}.json produced by
divisions/scrape_members.py, and writes database/csv/*.csv ready for
database/sql/02_load_from_csv.sql.

Re-runnable: it always rewrites the whole csv/ directory from the JSON, and
writes database/reports/build_report.md with row counts and every integrity
problem it had to work around.

    python database/scripts/build_database.py
"""

import csv
import json
import os
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIVISIONS_DIR = os.path.join(ROOT, "divisions")
OUT_DIR = os.path.join(ROOT, "database", "csv")
REPORT = os.path.join(ROOT, "database", "reports", "build_report.md")

# Fixed order and two-letter tags. "Elion" and "Elysium" both start "EL", so the
# tags are assigned by hand rather than derived.
DIVISIONS = [
    ("proxima", "Proxima", "PX"),
    ("aegis",   "Aegis",   "AG"),
    ("aura",    "Aura",    "AU"),
    ("elion",   "Elion",   "EN"),
    ("elysium", "Elysium", "EY"),
    ("kyra",    "Kyra",    "KY"),
    ("rhea",    "Rhea",    "VH"),
    ("vilis",   "Vilis",   "VS"),
]
# The order the divisions are LISTED in, which is group policy and has nothing
# to do with the order above -- that one is the scrape order, and reordering it
# would change which airline wins a shared carrier code in resolve_identity().
# Kept in step with database/sql/16_division_policy.sql; change both together.
DISPLAY_ORDER = ["kyra", "aegis", "elysium", "proxima", "rhea", "vilis", "elion", "aura"]
assert sorted(DISPLAY_ORDER) == sorted(d for d, _, _ in DIVISIONS),     "DISPLAY_ORDER and DIVISIONS name different divisions"

DIV_TAG = {d: tag for d, _, tag in DIVISIONS}
DIV_NAME = {d: name for d, name, _ in DIVISIONS}

CABINS = [
    # cabin_code, cabin_name, sort_order, source prefix in the export
    ("ECONOMY",         "Economy",         1, "eco"),
    ("PREMIUM_ECONOMY", "Premium Economy", 2, "premEco"),
    ("BUSINESS",        "Business",        3, "biz"),
    ("FIRST",           "First",           4, "first"),
]

SECONDS_PER_DAY = 86400

notes = defaultdict(list)      # category -> list of human-readable strings
counts = Counter()


def note(category, message):
    notes[category].append(message)


# ------------------------------------------------------------------ helpers

def slugify(name, uid):
    """Same rule as divisions/scrape_members.py, so folder names and slugs agree."""
    norm = unicodedata.normalize("NFKC", name or "").strip().lower()
    out = []
    for ch in norm:
        if ch.isalnum() or unicodedata.category(ch) in ("Mn", "Mc"):
            out.append(ch)
        else:
            out.append("_")
    slug = "".join(out)
    while "__" in slug:
        slug = slug.replace("__", "_")
    slug = slug.strip("_")
    return slug or "unknown_" + uid[:8]


def norm_departure(raw):
    """Split a raw departure value into (seconds after local midnight, day offset).

    db_notes.md says departureDailyTimestamp is seconds after 00:00 local at the
    origin. The Echo export carries values from -47400 to 209700 - stopover legs
    that spill onto the previous or following day - so the value is split into a
    normalised time of day plus a signed day offset, and the original is kept.
    """
    if raw is None:
        return None, None
    day_offset, seconds = divmod(int(raw), SECONDS_PER_DAY)   # floor division: -1, 39000
    return seconds, day_offset


def iso(value):
    return value or ""


def clamp_ratio(v):
    """Cabin ratios carry float noise: 16 values land just outside [0,1], the
    worst being -1.37e-17. Snap those to the boundary; anything genuinely out of
    range is left alone so the database rejects it loudly."""
    if v is None:
        return 0
    v = float(v)
    if -1e-9 < v < 0:
        counts["ratio_clamped"] += 1
        return 0.0
    if 1 < v < 1 + 1e-9:
        counts["ratio_clamped"] += 1
        return 1.0
    return v


def half_up(x):
    """round() is banker's rounding; fares need the ordinary kind."""
    return int(x + 0.5) if x >= 0 else -int(-x + 0.5)


def writer(name, header):
    path = os.path.join(OUT_DIR, name)
    fh = open(path, "w", newline="", encoding="utf-8")
    w = csv.writer(fh, lineterminator="\n")
    w.writerow(header)
    return fh, w


# ------------------------------------------------------------------- load

def load_rosters():
    """Return {division: {uid: roster_record}} for the extra fields the roster carries."""
    rosters = {}
    for div, _, _ in DIVISIONS:
        path = os.path.join(DIVISIONS_DIR, div, "members.json")
        data = json.load(open(path, encoding="utf-8"))
        if isinstance(data, dict):
            data = [data]
        by_uid = {}
        if data and isinstance(data[0], dict) and "allianceMemberUidList" in data[0]:
            # Alliance-object form (Proxima): no per-airline detail at all.
            alliance = data[0]
            rosters[div] = {"_alliance": alliance, "_members": {}}
            note("roster", f"{div}: alliance-object roster - no hubAirports or airlineId "
                           "for its members; hubs are derived from fleet bases")
            continue
        for r in data:
            if isinstance(r, dict) and r.get("uid"):
                by_uid[r["uid"]] = r
        rosters[div] = {"_alliance": None, "_members": by_uid}
    return rosters


def load_stats():
    stats = {}
    for div, _, _ in DIVISIONS:
        path = os.path.join(DIVISIONS_DIR, div, "members_stats.json")
        if not os.path.exists(path):
            continue
        for r in json.load(open(path, encoding="utf-8")):
            if r.get("uid"):
                stats[r["uid"]] = r
    return stats


def load_airlines(rosters):
    """One record per airline folder, in division then folder order."""
    airlines = []
    for div, _, _ in DIVISIONS:
        base = os.path.join(DIVISIONS_DIR, div, "members")
        for folder in sorted(os.listdir(base)):
            p = os.path.join(base, folder)
            if not os.path.isdir(p):
                continue
            info = json.load(open(os.path.join(p, "info.json"), encoding="utf-8"))
            airlines.append({
                "uid": info["uid"],
                "division": div,
                "folder": folder,
                "name": (info.get("name") or "").strip(),
                "raw_name": info.get("name"),
                "code": (info.get("code") or "").strip().upper() or None,
                "country": (info.get("country") or "").strip().upper() or None,
                "path": p,
                "roster": rosters[div]["_members"].get(info["uid"], {}),
            })
    return airlines


def assign_carrier_codes(airlines):
    """A globally unique code for flight designators.

    The game's own airlineCode is not unique - 136 codes are shared, and three
    airlines called Emirates sit in Elysium alone, so the division tag is not
    enough on its own either. Escalate only as far as needed:
        EK  -> unique already
        EKEY -> code shared across divisions
        EKEY2 -> code shared inside one division
    """
    by_code = defaultdict(list)
    for a in airlines:
        by_code[a["code"] or "ZZ"].append(a)

    for code, group in by_code.items():
        if len(group) == 1:
            group[0]["carrier_code"] = code
            continue
        by_div = defaultdict(list)
        for a in group:
            by_div[a["division"]].append(a)
        for div, members in by_div.items():
            tag = DIV_TAG[div]
            if len(members) == 1:
                members[0]["carrier_code"] = f"{code}{tag}"
            else:
                for n, a in enumerate(sorted(members, key=lambda x: x["uid"]), start=1):
                    a["carrier_code"] = f"{code}{tag}{n}"

    seen = {}
    for a in airlines:
        cc = a["carrier_code"]
        if cc in seen:
            raise SystemExit(f"carrier_code collision: {cc} on {a['uid']} and {seen[cc]}")
        seen[cc] = a["uid"]
    escalated = sum(1 for a in airlines if a["carrier_code"] != (a["code"] or "ZZ"))
    note("identity", f"{escalated} of {len(airlines)} airlines needed a division-qualified "
                     "carrier_code because the game code is shared")


# -------------------------------------------------------------------- main

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)

    rosters = load_rosters()
    stats = load_stats()
    airlines = load_airlines(rosters)
    assign_carrier_codes(airlines)
    print(f"{len(airlines)} airlines", file=sys.stderr)

    airports = set()
    models = set()
    fleet_ids = set()            # every real aircraftId
    placeholder_aircraft = {}    # aircraftId -> airline_uid, for assigned-but-sold airframes
    reg_seen = defaultdict(set)

    # ---- divisions ----
    fh, w = writer("divisions.csv", [
        "division_code", "division_name", "sort_order", "alliance_uid", "alliance_name",
        "alliance_description", "alliance_type", "alliance_logo", "alliance_logo_color",
        "created_time", "leader_uid",
    ])
    for div, name, _ in DIVISIONS:
        al = rosters[div]["_alliance"]
        w.writerow([
            div, name, DISPLAY_ORDER.index(div) + 1,
            iso(al and al.get("allianceId")), iso(al and al.get("allianceName")),
            iso(al and al.get("allianceDescription")), iso(al and al.get("allianceType")),
            iso(al and al.get("allianceLogo")), iso(al and al.get("allianceLogoColor")),
            iso(al and al.get("createdTime")), iso(al and al.get("leaderUid")),
        ])
    fh.close()

    # ---- airlines ----
    leader_uids = {rosters[d]["_alliance"]["leaderUid"]
                   for d, _, _ in DIVISIONS if rosters[d]["_alliance"]}
    fh_air, w_air = writer("airlines.csv", [
        "uid", "division_code", "airline_code", "carrier_code", "airline_name",
        "airline_slug", "airline_country", "airline_handle", "flagship_aircraft_model",
        "extra_special_livery_slot", "version_string", "claim_profit_time",
        "is_division_leader",
    ])
    for a in airlines:
        r = a["roster"]
        if not a["name"]:
            note("identity", f"{a['division']}/{a['folder']}: airline has no name in the "
                             f"export (uid {a['uid']})")
        w_air.writerow([
            a["uid"], a["division"], iso(a["code"]), a["carrier_code"], a["raw_name"] or "",
            a["folder"], iso(a["country"]), iso(r.get("airlineId")),
            iso(r.get("flagshipAircraftModel")),
            r.get("extraSpecialLiverySlot") if r.get("extraSpecialLiverySlot") is not None else "",
            iso(r.get("versionString")), iso(r.get("claimProfitTime")),
            "true" if a["uid"] in leader_uids else "false",
        ])
    fh_air.close()
    counts["airlines"] = len(airlines)

    # ---- fleet ----
    fh_ac, w_ac = writer("aircraft.csv", [
        "aircraft_id", "airline_uid", "aircraft_model", "registration", "delivery_date",
        "hub_airport_iata", "eco_ratio", "prem_eco_ratio", "biz_ratio", "first_ratio",
        "eco_product", "prem_eco_product", "biz_product", "first_product",
        "eco_config_type", "eco_pitch", "prem_eco_pitch", "biz_pitch", "first_pitch",
        "engine_option", "winglet_option", "eyemask_option",
        "background_image_index", "weekly_flight_time", "is_placeholder",
    ])
    for a in airlines:
        for ac in json.load(open(os.path.join(a["path"], "aircrafts.json"), encoding="utf-8")):
            aid = ac["aircraftId"]
            fleet_ids.add(aid)
            model = ac.get("aircraftModel")
            if model:
                models.add(model)
            hub = (ac.get("hubAirport") or "").strip().upper()
            if hub in ("", "EMPTY", "NONE"):
                hub = None
            else:
                airports.add(hub)
            reg = ac.get("registration") or ""
            if reg in reg_seen[a["uid"]]:
                note("fleet", f"{a['division']}/{a['folder']}: duplicate registration "
                              f"{reg} inside one fleet")
            reg_seen[a["uid"]].add(reg)
            ratios = [clamp_ratio(ac.get(k)) for k in
                      ("ecoRatio", "premEcoRatio", "bizRatio", "firstRatio")]
            if not (0.999 <= sum(ratios) <= 1.001):
                counts["ratio_off"] += 1
            w_ac.writerow([
                aid, a["uid"], model or "", reg, iso(ac.get("deliveryDate")), iso(hub),
                ratios[0], ratios[1], ratios[2], ratios[3],
                iso(ac.get("ecoProduct")), iso(ac.get("premEcoProduct")),
                iso(ac.get("bizProduct")), iso(ac.get("firstProduct")),
                iso(ac.get("ecoConfigType")),
                ac.get("ecoPitch") if ac.get("ecoPitch") is not None else "",
                ac.get("premEcoPitch") if ac.get("premEcoPitch") is not None else "",
                ac.get("bizPitch") if ac.get("bizPitch") is not None else "",
                ac.get("firstPitch") if ac.get("firstPitch") is not None else "",
                iso(ac.get("engineOption")), iso(ac.get("wingletOption")),
                iso(ac.get("eyemaskOption")),
                ac.get("backgroundImageIndex") if ac.get("backgroundImageIndex") is not None else "",
                ac.get("weeklyFlightTime") if ac.get("weeklyFlightTime") is not None else "",
                "false",
            ])
            counts["aircraft"] += 1

    # ---- schedule ----
    fh_f, w_f = writer("flights.csv", [
        "flight_id", "airline_uid", "outbound_flight_number", "inbound_flight_number",
        "flight_string", "origin_iata", "destination_iata", "departure_daily_seconds",
        "departure_day_offset", "departure_daily_seconds_raw", "outbound_duration_minutes",
        "inbound_duration_minutes", "turnaround_offset_minutes", "is_stopover",
        "child_stopover_flight_id",
    ])
    fh_as, w_as = writer("flight_assignments.csv", [
        "flight_id", "aircraft_id", "operating_days_per_week", "operating_days_mask",
        "flight_profit",
        # The game has exactly four cabins, always. As a child table that was
        # 1.64M rows and 266MB; as columns it is 411k rows and a few more ints.
        "eco_price", "prem_eco_price", "biz_price", "first_price",
        "eco_seats", "prem_eco_seats", "biz_seats", "first_seats",
        "eco_weekly_seats", "prem_eco_weekly_seats", "biz_weekly_seats",
        "first_weekly_seats",
    ])

    flight_ids = set()
    child_refs = set()
    route_key = Counter()
    pending_assignments = []          # rows whose aircraft is not in any fleet

    for a in airlines:
        for f in json.load(open(os.path.join(a["path"], "flights.json"), encoding="utf-8")):
            fid = f["flightId"]
            flight_ids.add(fid)
            o = (f.get("originAirport") or "").strip().upper()
            dst = (f.get("destinationAirport") or "").strip().upper()
            airports.add(o)
            airports.add(dst)
            secs, day_off = norm_departure(f.get("departureDailyTimestamp"))
            if day_off:
                counts["departure_rolled"] += 1
            child = f.get("childStopoverFlightId")
            if child:
                child_refs.add(child)
            route_key[(a["uid"], f["outboundFlightNumber"], o, dst)] += 1
            w_f.writerow([
                fid, a["uid"], f["outboundFlightNumber"], f["inboundFlightNumber"],
                iso(f.get("flightString")), o, dst, secs, day_off,
                f.get("departureDailyTimestamp"),
                f.get("outboundFlightDuration"), f.get("inboundFlightDuration"),
                f.get("turnaroundOffset") or 0,
                "true" if str(f.get("isStopover")).upper() == "TRUE" else "false",
                iso(child),
            ])
            counts["flights"] += 1

            for aid, asg in (f.get("aircraftAssignments") or {}).items():
                dows = sorted({int(x) for x in (asg.get("dowList") or [])})
                ndays = len(dows)
                row = (fid, aid, ndays, asg.get("flightProfit"), dows, asg, a["uid"])
                if aid not in fleet_ids:
                    pending_assignments.append(row)
                    continue
                write_assignment(w_as, row)
                counts["assignments"] += 1
                counts["assignment_days"] += ndays
                counts["fares"] += len(CABINS)

    # Assignments naming an airframe that no longer exists in any fleet: the plane
    # was sold or retired after the schedule was filed. Dropping them would lose
    # real, sellable seats, so a placeholder airframe stands in for each one.
    for row in pending_assignments:
        aid, owner = row[1], row[6]
        if aid not in placeholder_aircraft:
            placeholder_aircraft[aid] = owner
            w_ac.writerow([
                aid, owner, "Unknown", f"PLACEHOLDER-{aid[:8]}", "", "",
                1, 0, 0, 0, "", "", "", "", "", "", "", "", "",
                "", "", "", "", "", "true",
            ])
            counts["aircraft"] += 1
            models.add("Unknown")
        write_assignment(w_as, row)
        counts["assignments"] += 1
        counts["assignment_days"] += row[2]
        counts["fares"] += len(CABINS)
    if placeholder_aircraft:
        note("fleet", f"{len(placeholder_aircraft)} aircraft are rostered onto flights but "
                      f"absent from every fleet export ({len(pending_assignments)} assignments); "
                      "placeholder airframes were created so the seats stay sellable")

    fh_ac.close(); fh_f.close(); fh_as.close()

    dup_routes = sum(1 for v in route_key.values() if v > 1)
    if dup_routes:
        note("schedule", f"{dup_routes} (airline, flight number, origin, destination) "
                         "combinations appear on more than one flight_id - players may file "
                         "the same number twice, so that tuple is indexed but not unique")
    missing_children = child_refs - flight_ids
    if missing_children:
        note("schedule", f"{len(missing_children)} childStopoverFlightId values point at a "
                         "flight that is not in the export")
    else:
        note("schedule", f"all {len(child_refs)} stopover children resolve to a known flight")

    # ---- dimensions ----
    fh, w = writer("airports.csv", ["iata_code"])
    for code in sorted(airports):
        if len(code) == 3 and code.isalpha():
            w.writerow([code])
            counts["airports"] += 1
        else:
            note("airports", f"ignored malformed airport code {code!r}")
    fh.close()

    fh, w = writer("aircraft_models.csv", ["aircraft_model", "manufacturer"])
    for m in sorted(models):
        w.writerow([m, m.split()[0] if m and m != "Unknown" else ""])
        counts["aircraft_models"] += 1
    fh.close()

    fh, w = writer("cabin_classes.csv",
                   ["cabin_code", "cabin_name", "sort_order", "source_key_prefix"])
    for row in CABINS:
        w.writerow(row)
    fh.close()

    # ---- hubs ----
    fh, w = writer("airline_hubs.csv",
                   ["airline_uid", "airport_iata", "is_major_hub", "hub_source"])
    derived_for = 0
    for a in airlines:
        roster_hubs = [h.strip().upper() for h in (a["roster"].get("hubAirports") or [])
                       if h and h.strip().upper() in airports]
        major = (stats.get(a["uid"], {}).get("majorHubAirport") or "").strip().upper() or None
        if roster_hubs:
            source = "roster"
            hubs = roster_hubs
        else:
            # Proxima carries no hubAirports. Fleet bases are the game's own answer
            # to "where does this airline operate from", so they stand in until a
            # roster export for Proxima exists.
            hubs = sorted({r for r in fleet_hubs(a) if r})
            source = "derived_from_fleet"
            if hubs:
                derived_for += 1
        for h in hubs:
            w.writerow([a["uid"], h, "true" if h == major else "false", source])
            counts["hubs"] += 1
    fh.close()
    note("hubs", f"{derived_for} airlines had no hubAirports in their roster; their hubs were "
                 "derived from the base airports of their fleet")

    # ---- stats ----
    fh, w = writer("airline_stats.csv", [
        "airline_uid", "num_aircraft", "num_routes", "num_flights",
        "flagship_aircraft_model", "major_hub_iata", "last_online_time",
    ])
    known = {a["uid"] for a in airlines}
    for uid, s in stats.items():
        if uid not in known:
            continue
        hub = (s.get("majorHubAirport") or "").strip().upper()
        w.writerow([uid, s.get("numAircraft"), s.get("numRoutes"), s.get("numFlights"),
                    iso(s.get("flagshipAircraft")), hub if hub in airports else "",
                    iso(s.get("lastOnlineTime"))])
        counts["stats"] += 1
    fh.close()
    note("stats", f"member stats exist for {counts['stats']} of {len(airlines)} airlines "
                  "(only Aegis exported members_stats.json)")

    write_report()
    print("csv written to", OUT_DIR, file=sys.stderr)
    for k in ("airlines", "airports", "aircraft", "flights", "assignments",
              "assignment_days", "fares", "hubs"):
        print(f"  {k:18} {counts[k]:>9,}", file=sys.stderr)
    return 0


_fleet_hub_cache = {}


def fleet_hubs(airline):
    """Base airports of an airline's fleet, read once per airline."""
    if airline["uid"] in _fleet_hub_cache:
        return _fleet_hub_cache[airline["uid"]]
    hubs = set()
    for ac in json.load(open(os.path.join(airline["path"], "aircrafts.json"), encoding="utf-8")):
        h = (ac.get("hubAirport") or "").strip().upper()
        if h and h not in ("EMPTY", "NONE") and len(h) == 3 and h.isalpha():
            hubs.add(h)
    _fleet_hub_cache[airline["uid"]] = hubs
    return hubs


def write_assignment(w_as, row):
    fid, aid, ndays, profit, dows, asg, _owner = row
    # The operating weekdays as a 7-bit mask, bit 0 = Monday. One smallint
    # replaces a row per day: 1.8M rows and 235MB of index become one column.
    mask = 0
    for d in dows:
        mask |= 1 << d

    prices, per_dep, weekly = [], [], []
    for _code, _name, _order, prefix in CABINS:
        w = int(asg.get(prefix + "Pax") or 0)
        # 611 fares are exported as floats (479.2694...). Prices are whole
        # dollars everywhere else in the game, so they round half up.
        p = half_up(float(asg.get(prefix + "Price") or 0))
        # The exported *Pax figure pools the whole week AND both directions.
        weekly.append(w)
        per_dep.append(half_up(w / (ndays * 2)) if ndays else 0)
        prices.append(p)

    w_as.writerow([fid, aid, ndays, mask, profit if profit is not None else ""]
                  + prices + per_dep + weekly)


def write_report():
    lines = [
        "# Echo United Alliances -- build report",
        "",
        f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC by "
        "`database/scripts/build_database.py`.",
        "",
        "## Row counts",
        "",
        "| table | rows |",
        "|---|---:|",
    ]
    for key, table in [
        ("airlines", "airlines"), ("airports", "airports"),
        ("aircraft_models", "aircraft_models"), ("aircraft", "aircraft"),
        ("flights", "flights"), ("assignments", "flight_assignments"),
        ("hubs", "airline_hubs"), ("stats", "airline_stats"),
    ]:
        lines.append(f"| {table} | {counts[key]:,} |")
    lines += [
        "",
        "## Data conditions handled",
        "",
        f"- {counts['departure_rolled']:,} flights depart outside the 0-86399s day and were "
        "split into a time of day plus a signed day offset; the raw value is kept in "
        "`departure_daily_seconds_raw`.",
        f"- {counts['ratio_off']:,} aircraft have cabin ratios that do not sum to 1.0; "
        "they are loaded as exported and flagged by `v_aircraft_ratio_anomalies`.",
        f"- {counts['ratio_clamped']:,} individual cabin ratios carried float noise just "
        "outside [0,1] (worst: -1.37e-17) and were snapped to the boundary.",
        "",
    ]
    for category in sorted(notes):
        lines.append(f"### {category}")
        lines.append("")
        for m in notes[category][:40]:
            lines.append(f"- {m}")
        if len(notes[category]) > 40:
            lines.append(f"- ... and {len(notes[category]) - 40} more")
        lines.append("")
    open(REPORT, "w", encoding="utf-8").write("\n".join(lines))


if __name__ == "__main__":
    sys.exit(main())
