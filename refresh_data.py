"""Create reproducible public-data snapshots for the static preview.

Usage: python refresh_data.py [--with-timing]
No credentials or generated racing statistics are used.
"""
import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
import httpx

from backend.domain import FIRST_SEASON, current_season, is_available, match_session

DATA = Path(__file__).parent / "frontend" / "data"
JOLPICA = "https://api.jolpi.ca/ergast/f1"
OPENF1 = "https://api.openf1.org/v1"


def fetch(url):
    for attempt in range(3):
        try:
            response = httpx.get(url, headers={"User-Agent": "PitwallPortfolio/0.1"}, timeout=45, follow_redirects=True)
            response.raise_for_status()
            return response.json()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def save(name, payload):
    destination = DATA / name
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    temporary.replace(destination)


def refresh(with_timing=False):
    DATA.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    for season in range(FIRST_SEASON, current_season() + 1):
        calendar = fetch(f"{JOLPICA}/{season}/races.json?limit=100")["MRData"]["RaceTable"]["Races"]
        results = {}
        offset = 0
        while True:
            page = fetch(f"{JOLPICA}/{season}/results.json?limit=100&offset={offset}")
            for race in page["MRData"]["RaceTable"]["Races"]:
                results.setdefault(race["round"], []).extend(race["Results"])
            offset += 100
            if offset >= int(page["MRData"]["total"]):
                break
            time.sleep(0.4)
        sessions = fetch(f"{OPENF1}/sessions?year={season}&session_name=Race")
        for race in calendar:
            race["Results"] = results.get(race["round"], [])
            race["available"] = is_available(race, now)
            session = match_session(race, sessions)
            race["session_key"] = session["session_key"] if session else None
            if session:
                race["session_end"] = session["date_end"]
        save(f"season-{season}.json", {"season": season, "races": calendar, "updated_at": now.isoformat(), "stale": False})
        print(f"Season {season}: {len(calendar)} rounds, {sum(r['available'] for r in calendar)} completed", flush=True)
        if with_timing:
            completed = [r for r in calendar if r["available"] and r.get("session_key")]
            # One recent race per season is available offline; other races load on demand.
            for race in completed[-1:]:
                for kind in ("laps", "pit", "stints"):
                    key = race["session_key"]
                    save(f"timing-{key}-{kind}.json", fetch(f"{OPENF1}/{kind}?session_key={key}"))
                    print(f"  cached {race['raceName']} / {kind}", flush=True)
                    time.sleep(2.1)
    save("manifest.json", {"updated_at": now.isoformat(), "first_season": FIRST_SEASON, "sources": [JOLPICA, OPENF1]})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-timing", action="store_true")
    refresh(parser.parse_args().with_timing)
