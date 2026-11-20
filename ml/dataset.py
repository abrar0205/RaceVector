"""Preprocess only *recorded* OpenF1 samples; split by race weekend to limit leakage."""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np
from .forecast import FEATURES, SCALES, STEP_S, WINDOW, HORIZON_STEPS


def read_laps(root: str | Path):
    files = list(Path(root).rglob("*.json"))
    seen = set()
    for path in sorted(files):
        content = json.loads(path.read_text(encoding="utf8"))
        if content.get("source") != "OpenF1 historical API":
            continue
        for lap in content.get("laps", []):
            key = (lap.get("session_key"), lap.get("driver_number"), lap.get("lap_number"))
            if key in seen:
                continue
            seen.add(key)
            yield lap


def build_windows(lap: dict):
    """Return valid 6-second input windows and 2-second-ahead targets, excluding telemetry gaps."""
    samples = sorted(lap.get("car", []), key=lambda p: p["t"])
    if len(samples) < WINDOW + HORIZON_STEPS:
        return np.empty((0, WINDOW, 5), np.float32), np.empty((0,), np.float32)
    # Never interpolate across a > 1.5 sec hole: break the time series into separate segments.
    segments, current = [], []
    for s in samples:
        if current and s["t"] - current[-1]["t"] > 1.5:
            segments.append(current);current = []
        current.append(s)
    if current: segments.append(current)
    X, y = [], []
    for segment in segments:
        if len(segment) < WINDOW + HORIZON_STEPS:
            continue
        times = np.array([p["t"] for p in segment], dtype=np.float64)
        if len(np.unique(times)) != len(times):
            continue
        grid = np.arange(times[0], times[-1], STEP_S, dtype=np.float64)
        if len(grid) < WINDOW + HORIZON_STEPS:
            continue
        channels = []
        for feature, scale in zip(FEATURES, SCALES):
            series = np.array([p.get(feature, np.nan) for p in segment], dtype=np.float64)
            if not np.isfinite(series).all():
                channels = []
                break
            channels.append(np.interp(grid, times, series) / scale)
        if not channels:
            continue
        values = np.stack(channels, axis=1).astype(np.float32)
        for end in range(WINDOW - 1, len(grid) - HORIZON_STEPS):
            X.append(values[end - WINDOW + 1:end + 1])
            y.append(values[end + HORIZON_STEPS, 0])
    if not X:
        return np.empty((0, WINDOW, 5), np.float32), np.empty((0,), np.float32)
    return np.stack(X), np.array(y, dtype=np.float32)


def split_by_meeting(laps: list[dict], seed: int = 42):
    groups = sorted({lap.get("meeting_key") for lap in laps if lap.get("meeting_key") is not None})
    if len(groups) < 4:
        raise ValueError(f"Need at least 4 distinct race weekends for held-out evaluation; found {len(groups)}")
    rng = np.random.default_rng(seed)
    rng.shuffle(groups)
    n_test = max(1, round(len(groups) * .20))
    n_val = max(1, round(len(groups) * .20))
    test, val, train = set(groups[:n_test]), set(groups[n_test:n_test+n_val]), set(groups[n_test+n_val:])
    assert train and not (train & val or train & test or val & test)
    def pick(keys):return [lap for lap in laps if lap.get("meeting_key") in keys]
    return {"train": pick(train), "val": pick(val), "test": pick(test)}, {"train": sorted(train), "val": sorted(val), "test": sorted(test)}


def gather(laps):
    arrays = [build_windows(lap) for lap in laps]
    arrays = [(x,y) for x,y in arrays if len(x)]
    if not arrays:
        raise ValueError("No valid windows after data quality gates")
    return np.concatenate([pair[0] for pair in arrays]),np.concatenate([pair[1] for pair in arrays])
