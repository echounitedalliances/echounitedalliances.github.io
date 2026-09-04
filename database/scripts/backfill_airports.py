#!/usr/bin/env python3
"""Resolve the alliance's IATA codes into real airport detail.

The TAS exports carry three-letter codes and nothing else. This script merges
two open datasets into database/reference/airports_reference.json (kept in the
repo so the backfill is reproducible without network access) and writes
database/sql/03_airports_backfill.sql.

Sources, fetched once with --refresh:
  * OurAirports    name, city, country, latitude, longitude
  * mwgg/Airports  IANA timezone, and a fallback for codes OurAirports lacks

    python database/scripts/backfill_airports.py --refresh   # download, then build
    python database/scripts/backfill_airports.py             # build from the cached reference
"""

import argparse
import csv
import io
import json
import os
import sys
import urllib.request
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSV_AIRPORTS = os.path.join(ROOT, "database", "csv", "airports.csv")
REFERENCE = os.path.join(ROOT, "database", "reference", "airports_reference.json")
OUT_SQL = os.path.join(ROOT, "database", "sql", "03_airports_backfill.sql")
REPORT = os.path.join(ROOT, "database", "reports", "airport_backfill_report.md")

OURAIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
MWGG_URL = "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json"

# Countries that sit in exactly one IANA zone, used only where neither source
# carries a timezone for an airport. Nothing here is guessed for a country that
# spans zones.
COUNTRY_TZ = {
    "CN": "Asia/Shanghai",   "KG": "Asia/Bishkek",     "VN": "Asia/Ho_Chi_Minh",
    "TH": "Asia/Bangkok",    "KR": "Asia/Seoul",       "JP": "Asia/Tokyo",
    "IN": "Asia/Kolkata",    "PH": "Asia/Manila",      "MY": "Asia/Kuala_Lumpur",
    "SG": "Asia/Singapore",  "NP": "Asia/Kathmandu",   "BD": "Asia/Dhaka",
    "PK": "Asia/Karachi",    "LK": "Asia/Colombo",     "MM": "Asia/Yangon",
    "KH": "Asia/Phnom_Penh", "LA": "Asia/Vientiane",   "TW": "Asia/Taipei",
    "HK": "Asia/Hong_Kong",  "MO": "Asia/Macau",       "AE": "Asia/Dubai",
    "SA": "Asia/Riyadh",     "QA": "Asia/Qatar",       "KW": "Asia/Kuwait",
    "BH": "Asia/Bahrain",    "OM": "Asia/Muscat",      "JO": "Asia/Amman",
    "IL": "Asia/Jerusalem",  "TR": "Europe/Istanbul",  "GE": "Asia/Tbilisi",
    "AM": "Asia/Yerevan",    "AZ": "Asia/Baku",        "UZ": "Asia/Tashkent",
    "TM": "Asia/Ashgabat",   "TJ": "Asia/Dushanbe",    "IR": "Asia/Tehran",
    "IQ": "Asia/Baghdad",    "SY": "Asia/Damascus",    "LB": "Asia/Beirut",
    "EG": "Africa/Cairo",    "ZA": "Africa/Johannesburg", "KE": "Africa/Nairobi",
    "NG": "Africa/Lagos",    "GH": "Africa/Accra",     "ET": "Africa/Addis_Ababa",
    "MA": "Africa/Casablanca", "TN": "Africa/Tunis",   "DZ": "Africa/Algiers",
    "GB": "Europe/London",   "IE": "Europe/Dublin",    "FR": "Europe/Paris",
    "DE": "Europe/Berlin",   "IT": "Europe/Rome",      "ES": "Europe/Madrid",
    "NL": "Europe/Amsterdam","BE": "Europe/Brussels",  "CH": "Europe/Zurich",
    "AT": "Europe/Vienna",   "PL": "Europe/Warsaw",    "CZ": "Europe/Prague",
    "SE": "Europe/Stockholm","NO": "Europe/Oslo",      "DK": "Europe/Copenhagen",
    "FI": "Europe/Helsinki", "GR": "Europe/Athens",    "HU": "Europe/Budapest",
    "RO": "Europe/Bucharest","BG": "Europe/Sofia",     "HR": "Europe/Zagreb",
    "RS": "Europe/Belgrade", "SK": "Europe/Bratislava","SI": "Europe/Ljubljana",
    "UA": "Europe/Kyiv",     "BY": "Europe/Minsk",     "LT": "Europe/Vilnius",
    "LV": "Europe/Riga",     "EE": "Europe/Tallinn",   "IS": "Atlantic/Reykjavik",
    "PT": "Europe/Lisbon",   "MT": "Europe/Malta",     "CY": "Asia/Nicosia",
    "PE": "America/Lima",    "CO": "America/Bogota",   "VE": "America/Caracas",
    "BO": "America/La_Paz",  "PY": "America/Asuncion", "UY": "America/Montevideo",
    "CU": "America/Havana",  "JM": "America/Jamaica",  "PA": "America/Panama",
    "CR": "America/Costa_Rica", "GT": "America/Guatemala", "SV": "America/El_Salvador",
    "HN": "America/Tegucigalpa", "NI": "America/Managua", "DO": "America/Santo_Domingo",
    "NZ": "Pacific/Auckland", "FJ": "Pacific/Fiji",    "SG_": "Asia/Singapore",
}

# Codes that appear in no open dataset. Filled by hand rather than left blank.
MANUAL = {
    "FRU": ("Manas International Airport", "Bishkek", "KG", "Asia/Bishkek", 43.0613, 74.4776),
}


def fetch(url, path):
    print(f"  downloading {url}", file=sys.stderr)
    data = urllib.request.urlopen(url, timeout=120).read()
    with open(path, "wb") as f:
        f.write(data)
    return data


def build_reference(cache_dir, refresh):
    os.makedirs(cache_dir, exist_ok=True)
    oa_path = os.path.join(cache_dir, "ourairports.csv")
    mw_path = os.path.join(cache_dir, "mwgg_airports.json")
    if refresh or not os.path.exists(oa_path):
        fetch(OURAIRPORTS_URL, oa_path)
    if refresh or not os.path.exists(mw_path):
        fetch(MWGG_URL, mw_path)

    oa_rows = list(csv.DictReader(open(oa_path, encoding="utf-8")))
    oa = {r["iata_code"]: r for r in oa_rows if r.get("iata_code")}
    oa_by_icao = {r["icao_code"]: r for r in oa_rows if r.get("icao_code")}
    oa_by_ident = {r["ident"]: r for r in oa_rows if r.get("ident")}

    mw = json.load(open(mw_path, encoding="utf-8"))
    mw_by_iata = {v["iata"]: v for v in mw.values() if v.get("iata")}
    mw_by_icao = {v["icao"]: v for v in mw.values() if v.get("icao")}

    needed = [r["iata_code"] for r in csv.DictReader(open(CSV_AIRPORTS, encoding="utf-8"))]
    out = {}
    for code in needed:
        o = oa.get(code)
        m = mw_by_iata.get(code)
        if not m and o:
            m = mw_by_icao.get(o.get("icao_code")) or mw_by_icao.get(o.get("ident"))
        if not o and m:
            o = oa_by_icao.get(m.get("icao")) or oa_by_ident.get(m.get("icao"))

        manual = MANUAL.get(code)
        name = (o or {}).get("name") or (m or {}).get("name") or (manual[0] if manual else None)
        city = (o or {}).get("municipality") or (m or {}).get("city") or (manual[1] if manual else None)
        country = (o or {}).get("iso_country") or (m or {}).get("country") or (manual[2] if manual else None)
        tz = (m or {}).get("tz") or (manual[3] if manual else None)
        lat = (o or {}).get("latitude_deg") or (m or {}).get("lat") or (manual[4] if manual else None)
        lon = (o or {}).get("longitude_deg") or (m or {}).get("lon") or (manual[5] if manual else None)

        if not tz and country in COUNTRY_TZ:
            tz = COUNTRY_TZ[country]
            tz_source = "country_default"
        elif tz:
            tz_source = "dataset"
        else:
            tz_source = None

        out[code] = {
            "iata": code,
            "name": name or None,
            "city": city or None,
            "country": (country or "").upper()[:2] or None,
            "tz": tz,
            "tz_source": tz_source,
            "lat": float(lat) if lat not in (None, "") else None,
            "lon": float(lon) if lon not in (None, "") else None,
        }

    os.makedirs(os.path.dirname(REFERENCE), exist_ok=True)
    json.dump(out, open(REFERENCE, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1, sort_keys=True)
    return out


def standard_offset_minutes(tz_name):
    """Standard-time (non-DST) offset. January in the north, July in the south."""
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError):
        return None
    jan = datetime(2026, 1, 15, 12, tzinfo=tz).utcoffset()
    jul = datetime(2026, 7, 15, 12, tzinfo=tz).utcoffset()
    if jan is None or jul is None:
        return None
    # Standard time is the smaller absolute shift from UTC of the two.
    return int(min(jan, jul).total_seconds() // 60)


def sql_str(v):
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v):
    return "null" if v is None else repr(round(float(v), 6))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true",
                    help="re-download the open datasets before building")
    ap.add_argument("--cache-dir", default=os.path.join(ROOT, "database", "reference", ".cache"))
    args = ap.parse_args()

    if args.refresh or not os.path.exists(REFERENCE):
        ref = build_reference(args.cache_dir, args.refresh)
    else:
        ref = json.load(open(REFERENCE, encoding="utf-8"))
    print(f"{len(ref)} airports in the reference", file=sys.stderr)

    stats = Counter()
    rows = []
    for code in sorted(ref):
        a = ref[code]
        offset = standard_offset_minutes(a["tz"]) if a["tz"] else None
        stats["total"] += 1
        if a["name"]:
            stats["named"] += 1
        else:
            stats["unnamed"] += 1
        if a["lat"] is not None:
            stats["located"] += 1
        if a["tz"]:
            stats["tz_" + (a["tz_source"] or "dataset")] += 1
        else:
            stats["no_tz"] += 1
        rows.append(
            f"    ({sql_str(code)}, {sql_str(a['name'])}, {sql_str(a['city'])}, "
            f"{sql_str(a['country'])}, {sql_str(a['tz'])}, "
            f"{'null' if offset is None else offset}, "
            f"{sql_num(a['lat'])}, {sql_num(a['lon'])})"
        )

    header = f"""-- =====================================================================
--  Echo United Alliances -- airport backfill
--
--  Generated by database/scripts/backfill_airports.py on
--  {datetime.now().strftime('%Y-%m-%d')} from database/reference/airports_reference.json.
--  Do not edit by hand; re-run the script instead.
--
--  {stats['total']} airports: {stats['named']} named, {stats['located']} with coordinates,
--  {stats['total'] - stats['no_tz']} with an IANA timezone
--  ({stats['tz_country_default']} of those inferred from a single-timezone country).
--
--  utc_offset_minutes is the standard-time (non-DST) offset. The IANA name in
--  timezone is the authority if the app wants full DST handling.
-- =====================================================================

begin;

update public.airports a
   set airport_name       = v.airport_name,
       city_name          = v.city_name,
       country_code       = v.country_code,
       timezone           = v.timezone,
       utc_offset_minutes = v.utc_offset_minutes,
       offset_source      = case when v.timezone is null then null
                                 else 'iana_standard_time' end,
       latitude           = v.latitude,
       longitude          = v.longitude
  from (values
"""
    footer = """
  ) as v(iata_code, airport_name, city_name, country_code, timezone,
         utc_offset_minutes, latitude, longitude)
 where a.iata_code = v.iata_code;

commit;
"""
    with open(OUT_SQL, "w", encoding="utf-8", newline="\n") as f:
        f.write(header + ",\n".join(rows) + footer)

    md = [
        "# Airport backfill report",
        "",
        "Sources: OurAirports (name, city, country, coordinates) and mwgg/Airports",
        "(IANA timezone). Merged into `database/reference/airports_reference.json`.",
        "",
        "| metric | value |",
        "|---|---:|",
        f"| airports in the network | {stats['total']} |",
        f"| resolved to a real airport | {stats['named']} |",
        f"| with coordinates | {stats['located']} |",
        f"| with an IANA timezone | {stats['total'] - stats['no_tz']} |",
        f"| timezone from a dataset | {stats['tz_dataset']} |",
        f"| timezone inferred from country | {stats['tz_country_default']} |",
        f"| still without a timezone | {stats['no_tz']} |",
        f"| still unnamed | {stats['unnamed']} |",
        "",
        "Airports without a timezone render departure times exactly as the game",
        "stores them; everything else can be shown in real local time.",
        "",
    ]
    unresolved = [c for c in sorted(ref) if not ref[c]["name"]]
    if unresolved:
        md += ["## Unresolved codes", "",
               "Not present in either open dataset - most likely airports the game",
               "invented, or codes retired from the real world.", "",
               ", ".join(f"`{c}`" for c in unresolved), ""]
    no_tz = [c for c in sorted(ref) if not ref[c]["tz"]]
    if no_tz:
        md += ["## Without a timezone", "", ", ".join(f"`{c}`" for c in no_tz), ""]
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    open(REPORT, "w", encoding="utf-8").write("\n".join(md))

    for k in sorted(stats):
        print(f"  {k:20} {stats[k]:>6}", file=sys.stderr)
    print("wrote", OUT_SQL, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
