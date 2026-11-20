#!/usr/bin/env python3
"""Fetch actual historical OpenF1 lap telemetry. No synthetic samples are produced.

Use for a showcase lap: python -m pipeline.ingest --year 2024 --country Monaco --session Qualifying --driver-limit 2 --max-laps-per-driver 1 --positions
For training: repeat for multiple distinct Grand Prix weekends using --driver-limit 8 --max-laps-per-driver 4.
"""
from __future__ import annotations

import argparse
import json
import random
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API = "https://api.openf1.org/v1"


def get(endpoint: str, params: dict, attempts: int = 4) -> list[dict]:
    url = f"{API}/{endpoint}?{urlencode(params)}"
    for attempt in range(attempts):
        try:
            req = Request(url, headers={"User-Agent": "RaceVector-Research/0.1 (OpenF1 public historical data)", "Accept": "application/json"})
            with urlopen(req, timeout=50) as response:
                data = json.load(response)
            if not isinstance(data, list):
                raise ValueError(f"Expected a list from {endpoint}")
            time.sleep(1.2)  # stay comfortably inside published free quotas
            return data
        except (HTTPError, URLError, TimeoutError) as exc:
            code = getattr(exc, "code", None)
            if attempt == attempts - 1 or (code is not None and code not in (429, 500, 502, 503, 504)):
                raise
            time.sleep(min(20.0, 2 ** attempt + random.uniform(0, .5)))
    return []


def dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def valid_laps(raw: list[dict], driver_numbers: set[int], max_per_driver: int) -> list[dict]:
    per_driver: dict[int, list[dict]] = {}
    for lap in raw:
        number = lap.get("driver_number")
        seconds = lap.get("lap_duration")
        if number not in driver_numbers or not isinstance(seconds, (float, int)):
            continue
        if not 45 <= seconds <= 240 or lap.get("is_pit_out_lap") is True or not lap.get("date_start"):
            continue
        per_driver.setdefault(number, []).append(lap)
    selected = []
    for number, laps in per_driver.items():
        selected.extend(sorted(laps, key=lambda x: x["lap_duration"])[:max_per_driver])
    return selected


def clean_car(raw: list[dict], start: datetime, duration: float) -> list[dict]:
    values = []
    for r in raw:
        try:
            t = (dt(r["date"]) - start).total_seconds()
            speed = float(r["speed"])
            throttle = float(r["throttle"])
            rpm = float(r["rpm"])
            gear = float(r["n_gear"])
            if r.get("brake") is None:
                continue
            brake = int(bool(r["brake"]))
            if not (-.2 <= t <= duration + .2 and 0 <= speed <= 390 and 0 <= throttle <= 100 and 0 <= rpm <= 21000 and 0 <= gear <= 9):
                continue
            values.append({"t": round(t, 4), "speed": speed, "throttle": throttle,
                           "brake": brake, "rpm": rpm, "gear": gear})
        except (KeyError, TypeError, ValueError, OverflowError):
            continue
    return sorted({x["t"]: x for x in values}.values(), key=lambda x: x["t"])


def clean_location(raw: list[dict], start: datetime, duration: float) -> list[dict]:
    values = []
    for r in raw:
        try:
            t = (dt(r["date"]) - start).total_seconds()
            if not (-.2 <= t <= duration + .2):
                continue
            values.append({"t": round(t, 4), "x": float(r["x"]), "y": float(r["y"])})
        except (KeyError, TypeError, ValueError):
            continue
    return sorted({x["t"]: x for x in values}.values(), key=lambda x: x["t"])


def run(args: argparse.Namespace) -> Path:
    sessions = get("sessions", {"year": args.year, "country_name": args.country, "session_name": args.session})
    if not sessions:
        raise RuntimeError("No matching historical sessions found")
    session = sessions[0]
    sk = session["session_key"]
    drivers = {int(d["driver_number"]): d for d in get("drivers", {"session_key": sk})}
    laps = get("laps", {"session_key": sk})
    # Rank drivers by fastest valid lap, then retain N laps for each selected driver.
    quickest = valid_laps(laps, set(drivers), 1)
    chosen = {x["driver_number"] for x in sorted(quickest, key=lambda x: x["lap_duration"])[:args.driver_limit]}
    selected = valid_laps(laps, chosen, args.max_laps_per_driver)
    if len(chosen) < 2 or len(selected) < 2:
        raise RuntimeError("At least two drivers with timed laps are required")
    output = []
    for index, lap in enumerate(selected, 1):
        start = dt(lap["date_start"])
        duration = float(lap["lap_duration"])
        end = start + timedelta(seconds=duration)
        filters = {"session_key": sk, "driver_number": lap["driver_number"], "date>": start.isoformat(), "date<": end.isoformat()}
        car = clean_car(get("car_data", filters), start, duration)
        if len(car) < 12:
            print(f"Skipped incomplete lap for #{lap['driver_number']}: {len(car)} samples")
            continue
        pos = clean_location(get("location", filters), start, duration) if args.positions else []
        driver = drivers[int(lap["driver_number"])]
        output.append({"driver_number": lap["driver_number"], "name": driver.get("name_acronym") or driver.get("broadcast_name"),
                       "fullName": driver.get("full_name"), "lap_duration": duration, "lap_number": lap.get("lap_number"),
                       "session_key": sk, "meeting_key": session.get("meeting_key"), "car": car, "positions": pos})
        print(f"{index}/{len(selected)}: {driver.get('name_acronym')} lap {lap.get('lap_number')} — {len(car)} measured samples")
    if len(output) < 2:
        raise RuntimeError("Not enough complete real laps; nothing exported")
    target = Path(args.out) / f"{args.year}-{args.country.lower().replace(' ', '-')}-{args.session.lower()}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = {"schema_version": 1, "source": "OpenF1 historical API", "retrieved_at": datetime.now(timezone.utc).isoformat(),
               "license_note": "Check upstream OpenF1 and Formula 1 reuse terms before public redistribution",
               "session": session, "laps": output}
    target.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf8")
    print(f"Exported {len(output)} real historical laps to {target}")
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=2024)
    parser.add_argument("--country", default="Monaco")
    parser.add_argument("--session", choices=["Qualifying", "Race", "Practice 1", "Practice 2", "Practice 3"], default="Qualifying")
    parser.add_argument("--driver-limit", type=int, default=2)
    parser.add_argument("--max-laps-per-driver", type=int, default=1)
    parser.add_argument("--positions", action="store_true", help="Retrieve location coordinates for display; costs additional API requests")
    parser.add_argument("--out", default="web/data")
    run(parser.parse_args())
