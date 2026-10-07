# Vocab overlay browser fixture

This fixture renders the real overlay with in-memory requests. It does not start,
connect to, stop, or modify the Gobble game server. No credentials are needed.

From the repository root:

```powershell
node --preserve-symlinks --preserve-symlinks-main dev/vocab-overlay/verify.mjs
node --preserve-symlinks --preserve-symlinks-main dev/vocab-overlay/verify.mjs --supplement
```

The first command covers zero gain, 12 and 80 words, a level change, skipping and
replacing a running request, on desktop and mobile dimensions. The supplement
covers 100 unrelated parent updates with freshly created callbacks, real asset
URL changes, latest callbacks, 320×568 and 390×844 layouts and the 499→500 level
boundary. Progressbar bounds and rendered fill geometry are checked.
Use `--small-only` to rerun just the normal and level-boundary cases at 320×568.

The verifier starts only its own Vite server and Chromium browser, and closes
those processes afterward. Set `CHROME_PATH` when Chrome or Edge are not installed
at their usual Windows paths. `VOCAB_OVERLAY_ORIGIN` reuses an existing fixture
server. Results and screenshots go to `.tmp/vocab-overlay/current*`.

To inspect manually:

```powershell
node --preserve-symlinks --preserve-symlinks-main node_modules/vite/bin/vite.js --config dev/vocab-overlay/vite.config.mjs
```

Open <http://127.0.0.1:5187/dev/vocab-overlay/>. Controls start each example, and
`window.vocabOverlayFixture` exposes start, stop, skip, snapshot and metrics.

For a before/after comparison, capture the old sources **before editing** with
`node dev/vocab-overlay/capture-baseline.mjs`, then run the verifier with
`--baseline` and optionally `--supplement`. The capture refuses to overwrite an
existing baseline. The October 2026 baseline captured the former monolithic
overlay; its snapshot is a local artifact, not a production dependency.

Metrics include React profiler commits and durations, full-view render calls
(instrumented only by the fixture Vite plugin), animation-frame intervals, long
tasks, layout shifts, ResizeObserver callbacks and geometry reads. Sounds and
confetti are counted as callbacks; their rendering/audio engines are not run.
These are development React / desktop Chromium measurements, not evidence of
native iPhone frame rate, Safari behaviour or live multiplayer performance.
