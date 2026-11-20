# RACEVECTOR — Product & visual direction / 0.1

## North star

A **motorsport neural telemetry instrument**, not a generic analytics dashboard. First impression: the spatial clarity of a racing engineer's instrument panel, the editorial drama of a motorsport launch film, and the honesty of a scientific model-evaluation interface.

The interaction sequence is one continuous story: **select real session → enter measured circuit → scrub a corner → compare two recorded laps → inspect an evaluated neural forecast → see exactly where the model failed.**

## Art direction

- **Identity:** pitch-black carbon (#080B0F), layered graphite (#121B22), race-red (#F7433D), electric cyan (#43D3DF), fog-white typography (#ECF0E7).
- **Typography:** Barlow Condensed heavy for cinematic hero scale, DM Mono for evidence/metrics, Inter for readable technical copy. Pair strong oversize editorial forms with measured instrument details.
- **Hierarchy:** an initial full-viewport kinetic editorial opening, then a responsive 2-column workbench, then method and results. No stock photos, no glassmorphism everywhere, no scattered KPI cards. Data geometry is the main visual hero.
- **Signature track:** eventually a sculpted Three.js light-ribbon/circuit mesh whose vertex color is derived from *measured* speed. Separate model-vs-reality overlays only when real predictions exist; glow and sparks must not impersonate observations.
- **Signature neural feature:** an explorable architecture with true layer dimensions, real saved hidden activations and feature attributions; selecting a lap time changes every linked panel. Do not render random animated neurons with labels implying inference.
- **Motion language:** cinematic page transitions, smooth camera dolly, restrained cursor focus, GPU-friendly transforms. Interaction-driven, never continuous background noise; no gratuitous particle storm.
- **Dense information, not clutter:** a progressive disclosure model: hero/story; lap viewer; evidence details; method sheet. Metrics with unit, source, clock and caveat.

## Engineering contracts

- `sessions`: include official/recorded year, country, session, source URI, retrieval timestamp and identifiers.
- `lap`: `driver_number`, `session_key`, `meeting_key`, `lap_number`, `lap_duration`, observed `car[]`, approximate `positions[]`.
- `car sample`: `t (seconds)`, `speed (km/h)`, `throttle (percentage)`, `brake (boolean)`, `rpm`, `gear`. Omit unknown values, no zero-filled substitutions for missing critical fields.
- `model`: include version, training window, normalization parameters, test split, actual MAE/RMSE, persistence baseline, ONNX hash and optional activation mapping.
- Sync all UI views to a single playhead. Distinguish time-normalized and distance-normalized comparisons explicitly.

## Acceptance criteria for a best-in-class UI

1. **Truthful loading** — empty, loading, partial, error and ready states are sophisticated, not concealed. No generated speed, driver data or model metric fallbacks.
2. **Frame performance** — smooth scrubbing and steady animation on mainstream hardware; no FPS promises before measuring. Use preallocated geometry, RAF, devicePixelRatio cap and reduced-motion mode.
3. **Purposeful 3D** — WebGL only where spatial understanding improves. Provide accessible SVG/canvas fallback. Low-power mobile mode; avoid extravagant GPU postprocessing by default.
4. **Keyboard and screen reader** — semantic controls, range input, accessible status feedback, usable keyboard-only workflow, contrast checks, visible focus.
5. **Visual QA** — desktop 1440px, laptop 1024px, tablet 768px, phone 390px and narrow 320px. Inspect Playwright screenshots and browser console on each.
6. **Story, not noise** — recruiter can understand the project in 15 seconds, reach a real session in two actions, then dig into code/model evaluation.
7. **Reproducibility** — evaluated model from real sessions with out-of-group test, provenance, metrics and a baseline. If model fails to beat persistence, show it plainly.
8. **Resource budget** — lightweight first paint, lazy three.js/ONNX models, use Web Workers for inference/data transforms; measure actual bundled JS and web vitals, optimize after inspection.

## Division of work between ChatGPT and Claude

**ChatGPT (technical and integration owner)**
- Own telemetry contracts, API ingestion, data-quality gates, leakage-safe splitting, PyTorch architecture, training, evaluation, benchmarking, ONNX parity checks, accuracy/uncertainty documentation and final integration review.
- Verify all claims against code, outputs and real measured samples. Decide what belongs in the UI as measured vs predicted vs illustrative.

**Claude (UI implementation collaborator)**
- Build the cinematic React + TypeScript + React Three Fiber design using the API contracts above; implement page structure, responsive choreography, interaction and low-motion fallback.
- Never train a substitute model or fabricate telemetry to polish the interface. If real data or model output is unavailable, design outstanding honest states.
- Create small PRs from dedicated branches: `ui/identity`, `ui/circuit`, `ui/telemetry`, `ui/neural-explorer`; include screenshots and accessible interaction QA.

**One integrator** merges only after tests. No two agents should edit the same feature/data contract simultaneously. Share GitHub branches/PR links or patch files between chats; the agents do not directly communicate.

## Specific Claude handoff prompt

> Implement a best-in-class cinematic frontend for the attached RaceVector repository. Study `docs/PRODUCT_BRIEF.md`, `web/index.html`, `web/styles.css` and `web/app.js` as the approved initial visual language and telemetry contract. Rebuild the frontend using React, TypeScript, Vite, Three.js/React Three Fiber, D3 only where needed, and Motion for transitions. Deliver a distinctive motorsport engineering instrument rather than a generic dashboard: dramatic condensed typography, disciplined dark-carbon/red/electric-cyan palette, real-time-synchronized track ribbon, measured telemetry, reveal-on-demand analysis panels, purpose-built loading states, responsive high-quality motion, and robust reduced-motion fallbacks. Every car path, chart, number and neural activation MUST come from the real historical OpenF1 dataset or an explicitly evaluated checkpoint; NEVER fabricate source readings, model predictions, driver performance, or accuracy. Until ML artifacts exist, display an elegant honest 'model not yet trained' state. Do not add Formula 1 official branding or imply affiliation. Build interactions that work with real data and include tests, responsive screenshots and performance notes. Restrict PR changes to UI files; coordinate technical contracts with ChatGPT before changing them.

## Caveats / current state

The repository contains a **working design prototype and implementations of data-fetch and training commands, not an executed real-data training run**. Current compute environment does not permit external live telemetry downloads, so no training artifacts or accuracy claims are published. Running network-dependent jobs on a user machine or a repository CI runner with approved data access is the next integration step.
