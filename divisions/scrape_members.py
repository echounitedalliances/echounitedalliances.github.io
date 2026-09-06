#!/usr/bin/env python3
"""Bulk-retrieve virtual airline data from the TAS Supabase backend.

For every airline on a division's roster:
  query C (POST rpc/get_player_by_uid) -> members/<airline>/info.json
  query A (GET  new_player_flight_data) -> members/<airline>/flights.json
  query B (GET  player_aircraft_data)   -> members/<airline>/aircrafts.json

Two roster shapes are understood, auto-detected from divisions/<division>/members.json:
  * alliance form  - one object with leaderUid + allianceMemberUidList (proxima).
                     Names are unknown, so query C runs for every airline.
  * member form    - a list of per-airline records already carrying uid, airlineName,
                     airlineCode and airlineCountry (aegis). Query C runs only for
                     records whose name is blank and for --extra-uid additions.

Auth: the bearer JWT in test_instructions.md is short-lived (1 hour). Supply a fresh
one via the TAS_JWT environment variable or a token file (default: divisions/.token).
The apikey is read from test_instructions.md unless TAS_APIKEY is set.

Usage:
    python divisions/scrape_members.py --division proxima
    python divisions/scrape_members.py --division aegis \
        --extra-uid 58b1650b-3ded-4974-b2e3-8e4861875d79
    python divisions/scrape_members.py --division aegis --limit 3   # smoke test
    python divisions/scrape_members.py --division aegis --force     # re-fetch everything
"""

import argparse
import collections
import json
import os
import re
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://urmwaqnhesasfaeprcga-all.supabase.co"
DIVISIONS = os.path.dirname(os.path.abspath(__file__))
INSTRUCTIONS = os.path.join(DIVISIONS, "proxima", "members", "test_instructions.md")
TOKEN_FILE = os.path.join(DIVISIONS, ".token")

UA = "AirlineSimulator/293 CFNetwork/3860.700.1 Darwin/25.6.0"
CLIENT_INFO = "supabase-js-react-native/2.76.1"

print_lock = threading.Lock()

# The Windows console is cp1252; airline names are not. Never let a progress line
# crash the run.
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(errors="replace")


class AuthExpired(Exception):
    """Raised when the server rejects our JWT - no point retrying the rest."""


# --------------------------------------------------------------------------- creds

def load_credentials(args):
    md = ""
    if os.path.exists(INSTRUCTIONS):
        md = open(INSTRUCTIONS, encoding="utf-8").read()

    apikey = args.apikey or os.environ.get("TAS_APIKEY")
    if not apikey and md:
        m = re.search(r"^apikey:\s*(\S+)", md, re.M)
        apikey = m.group(1) if m else None

    jwt = args.jwt or os.environ.get("TAS_JWT")
    if not jwt:
        for path in (args.token_file, TOKEN_FILE):
            if path and os.path.exists(path):
                jwt = open(path, encoding="utf-8").read().strip()
                jwt = re.sub(r"(?i)^authorization:\s*", "", jwt)
                jwt = re.sub(r"(?i)^bearer\s+", "", jwt).strip()
                break
    if not jwt and md:
        m = re.search(r"^authorization:\s*Bearer\s+(\S+)", md, re.M)
        jwt = m.group(1) if m else None

    if not apikey or not jwt:
        sys.exit("ERROR: missing credentials. Set TAS_JWT (and TAS_APIKEY) or write the "
                 f"bearer token to {TOKEN_FILE}")
    return apikey, jwt


def jwt_expiry(jwt):
    """Return the exp claim as an epoch int, or None if unreadable."""
    import base64
    try:
        payload = jwt.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("exp")
    except Exception:
        return None


# ---------------------------------------------------------------------------- http

def request(url, headers, data=None, retries=4):
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=headers,
                                     method="POST" if data else "GET")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:400]
            if e.code in (401, 403):
                raise AuthExpired(f"HTTP {e.code}: {body}")
            if e.code == 429 or e.code >= 500:
                if attempt < retries - 1:
                    time.sleep(2 ** attempt)
                    continue
            raise RuntimeError(f"HTTP {e.code}: {body}")
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"network error: {e}")
    raise RuntimeError("exhausted retries")


def make_headers(apikey, jwt, post=False):
    h = {
        "accept": "*/*",
        "apikey": apikey,
        "authorization": "Bearer " + jwt,
        "x-client-info": CLIENT_INFO,
        "user-agent": UA,
        "accept-language": "en-GB,en;q=0.9",
    }
    if post:
        h["content-type"] = "application/json"
        h["content-profile"] = "public"
    else:
        h["accept-profile"] = "public"
    return h


# --------------------------------------------------------------------------- files

def write_json(path, obj):
    """Match the existing sample files: 4-space indent, CRLF, no trailing newline."""
    text = json.dumps(obj, indent=4, ensure_ascii=False).replace("\n", "\r\n")
    with open(path, "wb") as f:
        f.write(text.encode("utf-8"))


def slugify(name, uid):
    """Folder name from airlineName.

    NFKC runs before casefolding so styled-unicode names (mathematical-italic
    'FalconJet' and friends) collapse to plain letters. Non-latin scripts are kept
    as-is rather than thrown away - a readable folder beats a uid - and combining
    marks are preserved, otherwise Devanagari and Arabic names come out shredded.
    Only a name with nothing usable left falls back to the uid.
    """
    norm = unicodedata.normalize("NFKC", name or "").strip().lower()
    out = []
    for ch in norm:
        if ch.isalnum() or unicodedata.category(ch) in ("Mn", "Mc"):
            out.append(ch)
        else:
            out.append("_")
    slug = re.sub(r"_+", "_", "".join(out)).strip("_")
    return slug or "unknown_" + uid[:8]


# -------------------------------------------------------------------------- roster

def fetch_live_roster(division, apikey, jwt):
    """The division's CURRENT membership, from the game's own alliance table.

    A roster saved to disk is a photograph. Players join, leave, move between
    divisions and rename their airline, and none of that reaches a file. The
    snapshot this scraper used to trust had drifted badly: Essequibo Air had
    joined Elysium and was absent entirely, one uid had rebranded from ScotJet
    XPlore to GenZ Air Lines AND moved to Aura but still appeared under its old
    name in Elysium, and eighteen airlines across the group were missing.

    Reading `alliance` costs one request and cannot go stale.
    """
    name = "Echo " + division.capitalize()
    url = f"{BASE}/rest/v1/alliance?select=*&allianceName=eq.{urllib.parse.quote(name)}"
    rows = json.loads(request(url, make_headers(apikey, jwt)).decode())
    if not rows:
        return None
    a = rows[0]
    uids = list(dict.fromkeys(
        ([a["leaderUid"]] if a.get("leaderUid") else []) +
        list(a.get("allianceMemberUidList") or [])))
    return {"alliance": a, "uids": uids}


def load_roster(path, extra_uids):
    """Return (label, [record, ...]) where each record has at least a uid.

    The offline fallback, for when the live table cannot be reached. Names in a
    saved roster are NOT trusted -- see resolve_identity: they are only a hint
    for folder naming, and query C decides what an airline is actually called.
    """
    data = json.load(open(path, encoding="utf-8"))
    if isinstance(data, dict):
        data = [data]

    if data and isinstance(data[0], dict) and "allianceMemberUidList" in data[0]:
        alliance = data[0]
        uids = [alliance["leaderUid"]] + list(alliance.get("allianceMemberUidList") or [])
        records = [{"uid": u} for u in uids]
        label = alliance.get("allianceName", "?")
    else:
        records = [r for r in data if isinstance(r, dict) and r.get("uid")]
        label = os.path.basename(os.path.dirname(path))

    records += [{"uid": u} for u in extra_uids]

    deduped, seen = [], set()
    for r in records:
        if r["uid"] not in seen:
            seen.add(r["uid"])
            deduped.append(r)

    # Airlines really do share names ("Emirates" three times over). Where the roster
    # gives us the names up front, suffix *every* member of a colliding group with its
    # uid, so which airline owns the bare folder name does not depend on which thread
    # happened to finish first.
    counts = collections.Counter(
        slugify(r.get("airlineName"), r["uid"])
        for r in deduped if (r.get("airlineName") or "").strip()
    )
    for r in deduped:
        if (r.get("airlineName") or "").strip():
            slug = slugify(r["airlineName"], r["uid"])
            if counts[slug] > 1:
                r["_slug"] = f"{slug}_{r['uid'][:8]}"
    return label, deduped


# ---------------------------------------------------------------------------- work

def fetch_airline(record, members_dir, apikey, jwt, force, taken, taken_lock):
    uid = record["uid"]
    get_h = make_headers(apikey, jwt)
    post_h = make_headers(apikey, jwt, post=True)

    orphaned = False
    # Query C, always. This used to be skipped whenever the roster already
    # carried a name -- which meant the roster's photograph of an airline
    # outlived the airline. Four carriers were filed under names they no
    # longer use: United was flying as Chandelier, Senegalair as Anansie,
    # ScotJet XPlore as GenZ Air Lines, and one unnamed row had since become
    # China Eastern. The saved name is now only a fallback for when the
    # server has nothing to say.
    player = request(f"{BASE}/rest/v1/rpc/get_player_by_uid", post_h,
                     data=json.dumps({"p_uid": uid}).encode("utf-8"))
    rec = player[0] if isinstance(player, list) and player else player
    if not isinstance(rec, dict) or not rec:
        # The players row is gone (deleted/reset account) but the uid is still on
        # the roster, and its flight/aircraft rows may still exist. Capture what
        # is there instead of dropping the member silently.
        rec, orphaned = {}, True
    # Fall back to whatever the roster had if the server returns nothing.
    info = {
        "uid": uid,
        "name": rec.get("airlineName") or record.get("airlineName"),
        "country": rec.get("airlineCountry") or record.get("airlineCountry"),
        "code": rec.get("airlineCode") or record.get("airlineCode"),
    }

    slug = record.get("_slug") or slugify(info["name"], uid)
    with taken_lock:
        if slug in taken and taken[slug] != uid:
            slug = f"{slug}_{uid[:8]}"          # two airlines sharing a name
        taken[slug] = uid

    folder = os.path.join(members_dir, slug)
    os.makedirs(folder, exist_ok=True)
    write_json(os.path.join(folder, "info.json"), info)

    counts = {}
    for fname, table in (("flights.json", "new_player_flight_data"),
                         ("aircrafts.json", "player_aircraft_data")):
        path = os.path.join(folder, fname)
        if not force and os.path.exists(path) and os.path.getsize(path) > 2:
            counts[fname] = "kept"
            continue
        rows = request(f"{BASE}/rest/v1/{table}?select=*&uid=eq.{uid}", get_h)
        write_json(path, rows)
        counts[fname] = len(rows) if isinstance(rows, list) else "?"

    return slug, counts, orphaned


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--division", default="proxima", help="subfolder under divisions/")
    ap.add_argument("--extra-uid", action="append", default=[],
                    help="uid to include that the roster file omits (repeatable)")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--limit", type=int, help="only process the first N airlines")
    ap.add_argument("--force", action="store_true", help="re-fetch files that already exist")
    ap.add_argument("--offline-roster", action="store_true",
                    help="use the saved members.json instead of the live alliance table")
    ap.add_argument("--jwt")
    ap.add_argument("--apikey")
    ap.add_argument("--token-file")
    args = ap.parse_args()

    div_dir = os.path.join(DIVISIONS, args.division)
    members_dir = os.path.join(div_dir, "members")
    roster_path = os.path.join(div_dir, "members.json")
    os.makedirs(members_dir, exist_ok=True)

    apikey, jwt = load_credentials(args)
    exp = jwt_expiry(jwt)
    if exp:
        left = exp - time.time()
        print(f"token expires in {left/60:.1f} min", file=sys.stderr)
        if left <= 0:
            sys.exit("ERROR: the bearer token is already expired. Capture a fresh one "
                     "from the app and set TAS_JWT or write it to " + TOKEN_FILE)

    # The live table first; the saved file only if the server cannot be reached.
    label, records = None, None
    if not args.offline_roster:
        try:
            live = fetch_live_roster(args.division, apikey, jwt)
        except Exception as exc:
            print(f"live roster lookup failed ({exc}); falling back to members.json",
                  file=sys.stderr)
            live = None
        if live:
            label = live["alliance"].get("allianceName", args.division)
            records = [{"uid": u} for u in live["uids"]] +                       [{"uid": u} for u in args.extra_uid]
            write_json(os.path.join(div_dir, "members.json"),
                       [live["alliance"]])
            print(f"live roster: {len(live['uids'])} members", file=sys.stderr)
    if records is None:
        if not os.path.exists(roster_path):
            sys.exit(f"ERROR: no live roster and no file at {roster_path}")
        label, records = load_roster(roster_path, args.extra_uid)
        print("USING A SAVED ROSTER - names and membership may be out of date",
              file=sys.stderr)
        # de-dup, same as load_roster does
        seen, deduped = set(), []
        for r in records:
            if r["uid"] not in seen:
                seen.add(r["uid"]); deduped.append(r)
        records = deduped
    if args.limit:
        records = records[:args.limit]
    print(f"{len(records)} airlines in {label}", file=sys.stderr)

    taken, taken_lock = {}, threading.Lock()
    results, failures, orphans = [], [], []
    stop = threading.Event()

    def work(record):
        if stop.is_set():
            return
        try:
            slug, counts, orphaned = fetch_airline(record, members_dir, apikey, jwt,
                                                   args.force, taken, taken_lock)
            with print_lock:
                results.append((record["uid"], slug))
                if orphaned:
                    orphans.append((record["uid"], slug))
                print(f"  {'WARN' if orphaned else 'ok  '}{slug:<28} "
                      f"flights={counts['flights.json']} aircraft={counts['aircrafts.json']}"
                      f"  ({len(results)}/{len(records)})", file=sys.stderr)
        except AuthExpired as e:
            stop.set()
            with print_lock:
                failures.append((record["uid"], f"AUTH: {e}"))
        except Exception as e:
            with print_lock:
                failures.append((record["uid"], str(e)))
                print(f"  FAIL {record['uid']}: {e}", file=sys.stderr)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(work, records))

    print(f"\ndone: {len(results)} ok, {len(failures)} failed", file=sys.stderr)
    if stop.is_set():
        print("ABORTED: the server rejected our credentials (JWT expired/invalid). "
              "Capture a fresh bearer token and re-run - completed airlines are skipped "
              "automatically.", file=sys.stderr)
    for uid, slug in orphans:
        print(f"  WARNING: {uid} ({slug}) has no players row - get_player_by_uid returned "
              "null, so name/code/country are unknown. Flight and aircraft rows, if any, "
              "were still saved.", file=sys.stderr)
    for uid, err in failures:
        print(f"  {uid}: {err}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
