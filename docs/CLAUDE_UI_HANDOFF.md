# RaceVector — Instructions for Claude (UI ownership)

You are the lead frontend creative engineer for **RaceVector**, a premium, visually ambitious, data-driven Formula 1 neural telemetry laboratory. This is intended as a standout public engineering portfolio project, not a generic dashboard.

## First inspect

Read `docs/PRODUCT_BRIEF.md`, `web/index.html`, `web/styles.css`, `web/app.js`, `pipeline/ingest.py`, `ml/forecast.py`, and `ml/dataset.py`. The existing dependency-free frontend is a *proven visual prototype*, not the required final stack. Preserve the new aggressive race-red/carbon identity; raise the visual quality significantly. The user specifically rejected the earlier corporate/consultancy-like green design. The target should feel like a motorsport pit wall and a premium racing broadcast, NOT a Deloitte or enterprise dashboard.

## Build direction

Rebuild the final interface with React + TypeScript + Vite, Three.js + React Three Fiber for true interactive, GPU-accelerated circuit geometry, D3 or Canvas for measured traces, and Motion/GSAP only where cinematic transitions improve comprehension. Target a uniquely recognizable product identity: racing-carbon black, dominant competition red (#F7433D), electric cyan (#43D3DF) reserved for the second driver, and warm off-white, huge racing editorial typography, technical monospaced metadata, dark layered instrument surfaces. Avoid official F1 logos, team logos or unlicensed racing photos. No stock images, generic glassmorphism, cluttered cards, gratuitous particles, or mockups masquerading as real telemetry.

### Three signature experiences

1. **The Circuit Engine**: reconstruct an approximate track ribbon from real OpenF1 `positions` arrays; color the ribbon by measured speed or throttle. Make camera fly-through, orbit, scrub and two-driver comparison smooth. The geometry should illuminate, trail and transition at the selected real telemetry time only; show missing GPS and source uncertainty honestly. Provide an SVG/Canvas fallback.
2. **The Telemetry Theatre**: synchronize track, lap replay, speed curves, brake/throttle timelines, driver comparison, sectors if observed and selected time. Use purposeful motion and insightful detail interactions, not an ordinary chart grid. Support keyboard controls and accessible labels.
3. **The Neural Core**: render a true architecture view of the PyTorch model (5 features, 12 steps, three causal convolution layers of width 32, one final prediction head). Before a trained checkpoint exists, the view must be marked **architecture only / no predictions yet**. After ChatGPT delivers evaluated ONNX artifacts and real hidden activations, animate only actual values and display real holdout error metrics and attribution evidence. Never fake activations or invent accuracy.

## Absolute data integrity requirements

All session readings must be actual historical OpenF1/FastF1 telemetry. No synthetic speed data, fictional drivers, random model outcomes or generated lap times. Illustrative hero geometry is permitted only with an explicit 'illustrative, not measured' label. Show source, session ID, data freshness and known limitations; approximate OpenF1 locations do not yield ground-truth racing lines. Brake is an on/off channel, not measured brake pressure. Be clear when progress is time-normalized vs distance-aligned.

## Performance and UX

Use suspenseful but short cinematic transitions only when warranted, subtle input latency responses, fluid camera easing, measured depth of field, selective shader-based bloom and top-tier typography. Honor `prefers-reduced-motion`. Avoid ever loading a large 3D library or ONNX runtime before needed. Implement loading, no-data, API error, low-power GPU fallback and mobile layouts as finished experiences. Test 1440, 1024, 768, 390 and 320px widths in a real browser; provide screenshots and performance diagnostics. Aim for 60fps while scrubbing on common desktop hardware, *measure* it, and downgrade effects dynamically if needed. Ensure accessible contrast, keyboard focus and semantic UI.

## Collaboration contracts

ChatGPT owns `pipeline/`, `ml/`, model artifact format, real-data schema, training, reproducibility, evaluation and integrity review. Claude owns frontend implementation and visual QA. Work only on a dedicated `ui/` Git branch, deliver logically scoped PRs with screenshots, and avoid changing dataset or ML contracts without review. The two assistants cannot communicate directly; the user shares the repository/PR so ChatGPT can inspect and integrate changes.

## Done means

No stub buttons. No invisible errors. No made-up data. All working interactions, responsive screenshots, build passes, and evidence-driven UI. Future neural features that require a trained model must be visibly unavailable until an evaluated artifact is provided. The finished result should impress in the first 10 seconds **and** stand up to a technical interview.
