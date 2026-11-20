# RACEVECTOR — Neural Telemetry Laboratory

> **Status: sport-inspired UI prototype and real-data ML pipeline.** The GitHub training workflow has produced model artifacts, but the deployed web UI does not yet run the model or display evaluation results. The website contains **zero invented telemetry, outcomes, or model scores**.

RaceVector combines historical OpenF1 Formula 1 telemetry, a browser-based race engineering visualization and a reproducible PyTorch forecasting experiment. This project is independent and is not affiliated with Formula 1, any driver or team.

## What works now

- Responsive cinematic UI prototype, with editorial motorsport visual direction, circuit Canvas rendering and synchronized signal widgets.
- Automatically refreshed calendar of all OpenF1-listed race weekends (2023 through next year), with completed sessions selectable, upcoming races visible, and direct jump controls for latest completed race / next scheduled session. Source metadata refreshes daily through GitHub Pages Actions.
- Load actual historical lap data from OpenF1 with browser Cache Storage and a throttled retry queue, or optionally from a permitted local export; two fastest complete timed laps from different drivers are selected.
- Show recorded speed, throttle, brake and lap traces even when optional car-position data is missing or HTTP 429 limited. Play/pause/scrub/restart, keyboard controls and responsive layout.
- Historical OpenF1 ingestion script with filtering, backoff, provenance and source metadata.
- Causal PyTorch TCN training code, held-out race-weekend splitting, speed-persistence comparison, evaluation reporting and optional ONNX export.
- Unit tests for input filtering, leakage-safe splits, windows and model shapes.

## Run the UI

```sh
python -m http.server 8000 --directory web
```

Open http://localhost:8000. In production, GitHub Pages generates `web/data/catalog.json` during deployment and daily scheduled runs. Locally, first run `python -m pipeline.catalog --out web/data/catalog.json` on a network-enabled machine. Select a completed Grand Prix session and choose **LOAD RECORDED SESSION**. The page requests OpenF1 historical car data only for selected sessions and uses browser Cache Storage to avoid repeat calls. Future rounds appear in the calendar but cannot be replayed until their sessions are completed and outside the OpenF1 30-minute live-data window. OpenF1 API availability and free quotas still apply; there is no fictional fallback.

For a reliable offline historical demo, ingest an actual session **from a network-enabled machine**:

```sh
python -m pipeline.ingest --year 2024 --country Monaco --session Qualifying --positions --out web/data
```

The resulting `web/data/2024-monaco-qualifying.json` contains recorded source telemetry. It is ignored in Git by default until redistribution rights have been reviewed. The UI will use this local file when selected.

## Automated race calendar and OpenF1 rate limits

`pipeline/catalog.py` fetches only OpenF1 meeting/session **schedule metadata**, never raw race telemetry. The GitHub Pages workflow creates `web/data/catalog.json` when deployed and refreshes it daily at 03:17 UTC; future races become selectable for telemetry once completed (historical-tier delay applies). The catalog includes seasons starting in 2023 through the next year where OpenF1 publishes a schedule.

The frontend caches successful completed-session OpenF1 responses in each visitor's browser, queues requests at 700 ms intervals, retries 429 and transient 5xx with capped backoff, and handles optional location failures without discarding speed charts. This reduces duplicate requests but does **not** guarantee upstream uptime or bypass rate limits. Raw telemetry is not committed or deployed to public Pages because data reuse/redistribution rights require separate review.

## Train on actual race weekends

```sh
python -m pip install -r requirements.txt
# Collect at least FOUR DISTINCT meetings. Example:
python -m pipeline.ingest --year 2024 --country Monaco --driver-limit 8 --max-laps-per-driver 3 --out web/data
python -m pipeline.ingest --year 2024 --country Japan --driver-limit 8 --max-laps-per-driver 3 --out web/data
python -m pipeline.ingest --year 2024 --country Singapore --driver-limit 8 --max-laps-per-driver 3 --out web/data
python -m pipeline.ingest --year 2024 --country Belgium --driver-limit 8 --max-laps-per-driver 3 --out web/data
python -m ml.train --data web/data --out models --epochs 25
```

The job refuses to train with fewer than four distinct race weekends. Models predict **speed 2 seconds ahead** from a 6-second historical window of real speed, throttle, brake, gear and RPM. Evaluation reports test MAE/RMSE and a persistence baseline, with train/validation/test splits at *meeting* level. Training defaults to CPU, with optional `--onnx` export when the ONNX package is installed.

**Technical caveat:** displayed progress is normalized lap time, not accurate spatially aligned race-delta. Public car-position coordinates are approximate and not an accurate racing-line measurement. Brake data represents an on/off indicator, not brake pressure. Forecast targets are not causal driving recommendations. Robust missing-data and interpolation policies need additional evaluation before production claims.

## Next engineering work

1. Collect and audit multiple real weekends; publish a source manifest and a reproducible dataset summary, not raw files by default.
2. Train, validate and benchmark a checkpoint; record actual performance and failure cases, not just a success story.
3. Create a React/Three.js production implementation of the visual language; derive 3D ribbon and shader colors from actual samples. Preserve the light, dependency-free prototype as visual reference.
4. Wire **real** ONNX inference and real hidden activations into a model explorer. Never fake activation intensity or attribution.
5. Expand selection controls for driver and lap, use spatial distance for comparison, improve mobile GPU fallback and bundle-size budgets.
6. Deploy to a dedicated public GitHub repository with GitHub Pages and automated CI after confirming third-party reuse rights.

See [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md) for the visual direction, component contract, Claude collaboration brief, accessibility and performance acceptance criteria.

### OpenF1

Data: https://openf1.org/docs/. Historical use may be free but is subject to upstream usage rights, rate limits and available telemetry. Credit source in public UI. Never include unofficial F1 team or driver logos in a way that implies endorsement.

## GitHub automation (after creating the repository)

- `Validate RaceVector` runs Python unit tests, model-source checks and frontend JS syntax checks on pushes/PRs.
- `Train RaceVector on real historical telemetry` is a **manual GitHub Actions workflow**. It downloads genuine past-session telemetry, trains on the GitHub-hosted CPU runner, evaluates against a persistence baseline, exports a checkpoint plus optional ONNX and uploads only model/evaluation artifacts. It does **not** publish raw telemetry or claim success before outputs exist. This needs a connected public repository and a network-enabled Actions runner.
- `Deploy RaceVector visual lab` builds the scheduled meeting/session catalog, publishes it with the frontend, and repeats the rebuild daily at 03:17 UTC. It refuses to deploy raw telemetry JSON. The website fetches selected OpenF1 historical telemetry at runtime, with local browser caching, backoff and graceful location fallback.

## Design statement

RaceVector uses an **independent motorsport identity**, not official Formula 1/team marks: race red, carbon black, condensed italic racing type, telemetry cyan for comparison and bold track graphics. The first UI is a purposeful prototype. The final React/Three.js workbench is planned as the next milestone, subject to real-data verification and visual QA.