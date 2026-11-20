"""Fetch a pinned, MIT-licensed GeoJSON circuit-outline catalog for public Pages.

This contains geographic circuit geometry only. It does NOT redistribute OpenF1
car-location telemetry. Copyright attribution is copied next to the dataset.
"""
from __future__ import annotations
import json
from pathlib import Path
from urllib.request import Request, urlopen

REVISION = "8094e957b8d6aa8b9f4510c93968556cccd30e02"
BASE = f"https://raw.githubusercontent.com/bacinger/f1-circuits/{REVISION}"

def build(out: str | Path = "web/data/circuits.geojson") -> Path:
    target = Path(out)
    target.parent.mkdir(parents=True, exist_ok=True)
    request = Request(f"{BASE}/f1-circuits.geojson", headers={"User-Agent": "RaceVector-circuit-build/1.0"})
    with urlopen(request,timeout=45) as response:
        content = response.read()
    data = json.loads(content)
    assert data.get("type") == "FeatureCollection"
    assert len(data.get("features",[])) >= 30
    assert all(f.get("geometry", {}).get("type") == "LineString" for f in data["features"])
    request = Request(f"{BASE}/LICENSE.md", headers={"User-Agent": "RaceVector-circuit-build/1.0"})
    with urlopen(request,timeout=45) as response:
        license_text = response.read().decode("utf8")
    assert "Tomislav Bacinger" in license_text and "MIT" not in license_text[:15]  # verify expected upstream
    target.write_bytes(content)
    (target.parent / "CIRCUITS-LICENSE.txt").write_text(
        "Source: https://github.com/bacinger/f1-circuits\n"
        f"Pinned revision: {REVISION}\n"
        "Geographic circuit outlines only, not recorded car telemetry.\n\n" + license_text,
        encoding="utf8"
    )
    print(f"Published {len(data['features'])} licensed circuit outlines and attribution")
    return target

if __name__ == "__main__":
    build()