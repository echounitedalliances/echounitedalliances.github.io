"""Write the departure boards, timetables and airport carrier lists to Storage.

Run by database/scripts/weekly.ps1 after database/weekly/3_refresh.sql, while
mv_legs is still populated -- database/weekly/4_finish.sql empties it once
this has succeeded (51_schedule_summaries.sql explains why).

Three kinds of file, all public, gzip-compressed, in the 'schedule' bucket:

  airports/<IATA>/board.json     the week's departure board: one flight per
                                 departure slot and day, exactly as
                                 board_departures picked them, with the
                                 airport's clock zone. The browser works out
                                 "next eight from now" itself.
  airports/<IATA>/carriers.json  who departs from here, and to how many places
  airlines/<uid>/timetable.json  the carrier's full timetable, grouped as
                                 airline_timetable grouped it
  manifest.json                  when this ran, and how many of each

Files for airports and carriers that have gone are deleted, so a page never
shows a schedule from a week that no longer exists.

    python database/scripts/export_schedule.py
"""
from __future__ import annotations

import csv
import json
import os
import re
import subprocess
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import echo_storage  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'database' / 'csv' / 'schedule'   # git-ignored, like the rest of database/csv
# --reuse: build the files from the last run's CSVs instead of the database,
# for retrying an upload after mv_legs has been emptied.
REUSE = '--reuse' in sys.argv

# One flight per departure slot per day: LHR alone pushes 143 flights at 06:00,
# and a board listing them all is a single repeated time. Same rule, same
# tie-break-free pick as board_departures, made deterministic here.
BOARD_SQL = """
select distinct on (l.origin_iata, d.dow, l.departure_minute)
       l.origin_iata, d.dow, l.departure_minute, a.carrier_code,
       case when l.is_inbound then f.inbound_flight_number else f.outbound_flight_number end,
       l.destination_iata
  from public.mv_legs l
  join public.airlines a on a.uid = l.airline_uid and a.is_published
  join public.flights  f on f.flight_id = l.flight_id
  join public.airports ap on ap.iata_code = l.destination_iata
  cross join generate_series(0, 6) d(dow)
 where (l.departure_days_mask::int >> d.dow) & 1 = 1
 order by l.origin_iata, d.dow, l.departure_minute, a.carrier_code, 5
"""

# The board's own airport, and how each destination is labelled on it.
ORIGINS_SQL = """
select iata_code, coalesce(city_name, airport_name, iata_code), timezone
  from public.mv_airport_directory
"""
PLACES_SQL = """
select iata_code, coalesce(place_label, city_name, airport_name, iata_code) from public.airports
"""
AIRLINES_SQL = """
select a.carrier_code, coalesce(a.airline_name, a.carrier_code), a.division_code,
       coalesce(a.accent_color, dv.accent_color, '#A855F7')
  from public.airlines a left join public.divisions dv on dv.division_code = a.division_code
 where a.is_published
"""

CARRIERS_SQL = """
select l.origin_iata, d.uid, d.division_code, d.division_name, d.accent_color,
       d.airline_slug, d.carrier_code, d.airline_name,
       count(distinct l.destination_iata),
       exists (select 1 from public.airline_hubs h
                where h.airline_uid = d.uid and h.airport_iata = l.origin_iata)
  from public.mv_leg_departures l
  join public.mv_airline_directory d on d.uid = l.airline_uid
 group by l.origin_iata, d.uid, d.division_code, d.division_name, d.accent_color,
          d.airline_slug, d.carrier_code, d.airline_name
"""

# airline_timetable's grouping, for every carrier at once.
TIMETABLE_SQL = """
select t.uid, t.designator, t.origin, t.destination, t.dep, t.arr, t.arr_days,
       t.minutes, t.model, bit_or(t.mask), t.economy, min(t.business)
  from (
    select l.airline_uid as uid,
           a.carrier_code || ' ' ||
             case when l.is_inbound then f.inbound_flight_number else f.outbound_flight_number end as designator,
           l.origin_iata as origin, l.destination_iata as destination,
           l.departure_minute as dep, l.arrival_minute as arr,
           l.arrival_days_after_departure as arr_days,
           (l.arrival_minute_abs - l.departure_minute) as minutes,
           ac.aircraft_model as model,
           l.departure_days_mask::int as mask,
           l.economy_price as economy, l.business_price as business
      from public.mv_legs l
      join public.airlines a  on a.uid = l.airline_uid
      join public.aircraft ac on ac.aircraft_id = l.aircraft_id
      join public.flights  f  on f.flight_id = l.flight_id
  ) t
 group by t.uid, t.designator, t.origin, t.destination, t.dep, t.arr, t.arr_days,
          t.minutes, t.model, t.economy
 order by t.uid, t.origin, t.dep, t.designator
"""


def connection_string() -> str:
    cfg: dict[str, str] = {}
    for line in (REPO / 'database' / 'connection.txt').read_text(encoding='utf-8').splitlines():
        if line.lstrip().startswith('#'):
            continue
        m = re.match(r'^\s*([A-Z_]+)\s*=\s*(.+?)\s*$', line)
        if m:
            cfg[m[1]] = m[2]
    return (f"host={cfg['DB_HOST']} port={cfg['DB_PORT']} dbname={cfg['DB_NAME']} "
            f"user={cfg['DB_USER']} sslmode=require")


def psql_exe() -> str:
    from shutil import which
    found = which('psql')
    if found:
        return found
    candidates = sorted(Path('C:/Program Files/PostgreSQL').glob('*/bin/psql.exe'))
    if not candidates:
        raise SystemExit('psql not found.')
    return str(candidates[-1])


def dump(name: str, sql: str) -> list[list[str]]:
    """One query to a CSV under database/csv/schedule, read back as rows."""
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f'{name}.csv'
    if REUSE and path.exists():
        with path.open(encoding='utf-8', newline='') as f:
            return list(csv.reader(f))
    one_line = ' '.join(sql.split())
    env = dict(os.environ)
    # The weekly script sets this; a standalone run finds Echo's own file.
    env.setdefault('PGPASSFILE', str(Path(os.environ.get('APPDATA', '')) / 'postgresql' / 'echo-united-alliances.pgpass'))
    env['PGCLIENTENCODING'] = 'UTF8'
    started = time.time()
    subprocess.run(
        [psql_exe(), connection_string(), '-X', '-q', '-v', 'ON_ERROR_STOP=1',
         '-c', 'set statement_timeout = 0',
         '-c', f"\\copy ({one_line}) to '{path.as_posix()}' with (format csv)"],
        check=True, env=env)
    with path.open(encoding='utf-8', newline='') as f:
        rows = list(csv.reader(f))
    print(f'  {name}: {len(rows):,} rows ({time.time() - started:.0f}s)', flush=True)
    return rows


def compact(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def nint(v: str):
    return int(v) if v != '' else None


def main() -> None:
    print('==> reading the schedule out of mv_legs', flush=True)
    board = dump('board', BOARD_SQL)
    origins = {r[0]: (r[1], r[2] or None) for r in dump('origins', ORIGINS_SQL)}
    places = {r[0]: r[1] for r in dump('places', PLACES_SQL)}
    airlines = {r[0]: r[1:] for r in dump('airlines', AIRLINES_SQL)}
    carriers = dump('carriers', CARRIERS_SQL)
    timetable = dump('timetable', TIMETABLE_SQL)
    if not board or not timetable:
        raise SystemExit('mv_legs gave no departures: is it populated? Nothing was uploaded.')

    files: dict[str, bytes] = {}

    by_origin: dict[str, list[list[str]]] = defaultdict(list)
    for r in board:
        by_origin[r[0]].append(r)
    for iata, rows in by_origin.items():
        city, tz = origins.get(iata, (iata, None))
        codes: list[str] = []
        index: dict[str, int] = {}
        dests: dict[str, str] = {}
        slots = []
        for _, dow, minute, code, number, dest in rows:
            if code not in index:
                index[code] = len(codes)
                codes.append(code)
            dests[dest] = places.get(dest, dest)
            slots.append([int(dow), int(minute), index[code], number, dest])
        files[f'airports/{iata}/board.json'] = compact({
            'v': 1, 'iata': iata, 'city': city, 'tz': tz,
            'airlines': [[c, *airlines.get(c, [c, None, '#A855F7'])] for c in codes],
            'places': dests,
            'slots': slots,
        })

    by_airport: dict[str, list] = defaultdict(list)
    for o, uid, div, divname, accent, slug, code, name, n, hub in carriers:
        by_airport[o].append([uid, div, divname, accent, slug, code, name, int(n), hub == 't'])
    for iata, rows in by_airport.items():
        rows.sort(key=lambda r: (-r[7], r[6] or ''))
        files[f'airports/{iata}/carriers.json'] = compact({'v': 1, 'carriers': rows})

    by_airline: dict[str, list] = defaultdict(list)
    for uid, des, o, d, dep, arr, arr_days, minutes, model, mask, eco, biz in timetable:
        by_airline[uid].append([des, o, d, int(dep), int(arr), int(arr_days), int(minutes),
                                model or None, int(mask), nint(eco), nint(biz)])
    for uid, rows in by_airline.items():
        files[f'airlines/{uid}/timetable.json'] = compact({'v': 1, 'rows': rows})

    files['manifest.json'] = compact({
        'v': 1,
        'built_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'airports': len(by_origin),
        'airlines': len(by_airline),
        'board_slots': len(board),
        'timetable_rows': len(timetable),
    })

    biggest = max(files.items(), key=lambda kv: len(kv[1]))
    total = sum(len(b) for b in files.values())
    print(f'==> {len(files):,} files, {total / 1e6:.1f} MB before compression; '
          f'largest {biggest[0]} {len(biggest[1]) / 1e3:.0f} KB', flush=True)

    s3 = echo_storage.client()
    started = time.time()
    with ThreadPoolExecutor(max_workers=24) as pool:
        # The manifest last, so it only ever names a finished upload.
        list(pool.map(lambda kv: echo_storage.put_json(s3, kv[0], kv[1]),
                      [kv for kv in files.items() if kv[0] != 'manifest.json']))
    echo_storage.put_json(s3, 'manifest.json', files['manifest.json'], max_age=300)
    print(f'==> uploaded in {time.time() - started:.0f}s', flush=True)

    # What last week had and this week does not.
    stale = []
    for page in s3.get_paginator('list_objects_v2').paginate(Bucket=echo_storage.BUCKET):
        for obj in page.get('Contents', []):
            if obj['Key'] not in files:
                stale.append(obj['Key'])
    # One at a time: Supabase's S3 refuses the batch DeleteObjects that
    # current boto3 sends. A week leaves only a handful.
    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(lambda k: s3.delete_object(Bucket=echo_storage.BUCKET, Key=k), stale))
    print(f'==> removed {len(stale)} stale files', flush=True)


if __name__ == '__main__':
    main()
