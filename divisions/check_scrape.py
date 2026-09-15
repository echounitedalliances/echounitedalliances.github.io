#!/usr/bin/env python3
"""Prove a scrape is complete before anything is loaded from it.

Every scraper exit code in the world will not tell you that a roster member
is missing -- a 503 from the game server on one airline, an expired token
halfway through a division, a stale folder left from last week. This checks
what is actually on disk against what the live rosters say should be there:

  * every uid on every division's roster has a folder
  * every folder has info.json, flights.json, aircrafts.json and livery.json
  * no folder belongs to an airline that is not on its roster (a departed or
    renamed airline's old folder would otherwise be loaded as a member)
  * no airline appears in two divisions

Exits 1 on any hole, so weekly.ps1 stops before the database is touched.
A nameless airline is reported but allowed: that is a deleted game account
still listed on a roster, and it has been one for weeks.

    python divisions/check_scrape.py
"""
import glob
import json
import os
import sys
from collections import defaultdict

DIVISIONS = ["aegis", "aura", "elion", "elysium", "kyra", "proxima", "rhea", "vilis"]
HERE = os.path.dirname(os.path.abspath(__file__))
REQUIRED = ("info.json", "flights.json", "aircrafts.json", "livery.json")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")


def main():
    problems, warnings = [], []
    seen_in = defaultdict(list)
    totals = defaultdict(int)

    for div in DIVISIONS:
        alliance = json.load(open(os.path.join(HERE, div, "members.json"), encoding="utf-8"))
        alliance = alliance[0] if isinstance(alliance, list) else alliance
        roster = list(dict.fromkeys(
            ([alliance["leaderUid"]] if alliance.get("leaderUid") else []) +
            list(alliance.get("allianceMemberUidList") or [])))

        on_disk = {}
        for info_path in glob.glob(os.path.join(HERE, div, "members", "*", "info.json")):
            on_disk[json.load(open(info_path, encoding="utf-8"))["uid"]] = os.path.dirname(info_path)

        for uid in roster:
            seen_in[uid].append(div)
            folder = on_disk.get(uid)
            if not folder:
                problems.append(f"{div}: {uid} is on the roster but has no folder")
                continue
            for name in REQUIRED:
                if not os.path.exists(os.path.join(folder, name)):
                    problems.append(f"{div}/{os.path.basename(folder)}: missing {name}")
            info = json.load(open(os.path.join(folder, "info.json"), encoding="utf-8"))
            if not (info.get("name") or "").strip():
                warnings.append(f"{div}/{os.path.basename(folder)}: no name (a deleted game account)")
            for name, key in (("flights.json", "flights"), ("aircrafts.json", "aircraft")):
                path = os.path.join(folder, name)
                if os.path.exists(path):
                    totals[key] += len(json.load(open(path, encoding="utf-8")))

        for uid in set(on_disk) - set(roster):
            problems.append(f"{div}: folder {os.path.basename(on_disk[uid])} is for {uid}, "
                            "who is not on the roster -- it would be loaded as a member")
        totals["airlines"] += len(roster)
        print(f"  {div:8} roster {len(roster):3}  folders {len(on_disk):3}")

    for uid, divs in seen_in.items():
        if len(divs) > 1:
            problems.append(f"{uid} is on the roster of {', '.join(divs)}")

    print(f"\n  {totals['airlines']} airlines, {totals['flights']:,} flights, "
          f"{totals['aircraft']:,} aircraft")
    for w in warnings:
        print(f"  note: {w}")
    if problems:
        print(f"\nINCOMPLETE -- {len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("\n  complete: every roster member is on disk with every file.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
