# Handoff Notes — Wizard's Chess (Gothic Cathedral)

## 1. Tasks 0–8 Implementation Status

**No tasks were skipped.** All tasks from Task 0 through Task 8 were fully implemented, tested, and verified according to `ANTIGRAVITY_BRIEF.md`:

- **Task 0 (Baseline)**: Git initialized, clean `.gitignore`, `README.md`, ESLint 8 passing with 0 errors on existing code, and GitHub Actions CI workflow in `.github/workflows/ci.yml`.
- **Task 1 (Visual Regression Harness)**: Headless Chromium regression test (`tests/visual_regression.mjs`) using SwiftShader (`--use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader --ignore-gpu-blocklist --allow-file-access-from-files`). Captured pixel-exact baselines for distance 9, distance 25, and selected square.
- **Task 2 (Module Loading Verification)**: Confirmed that pywebview blocks native `<script type="module">` imports when running under the `file://` protocol due to WebView CORS restrictions.
- **Task 3 (Split `game.js` into ES Modules)**: Split the 1,583-line monolith into dedicated ES modules in the mandated extraction order:
  1. `web/audio.js` (CathedralAudio synth)
  2. `web/textures.js` + `web/materials.js` (Procedural stone textures, faction materials, Three.js renderer/scene/camera, `cg`/`cmat` caches)
  3. `web/cathedral.js` (Sanctuary architecture, dais, pillars, braziers, lighting)
  4. `web/pieces.js` (Procedural 3D Gothic chess piece geometries)
  5. `web/board.js` (Tiles, additive emissive highlights, 3D tactical reticles, `syncBoardFull`, `spawnShatter`)
  6. `web/input.js` (Pointer raycasting, piece-vs-tile disambiguation, drag-vs-orbit, `executeMoveAnimated`, `triggerAI`, hints)
  7. `web/hud.js` (Telemetry, captured trays, material advantage, 2-column move ledger, modals, undo/reset, quality toggles)
  8. `web/camera.js` (Presets 1/2/3, flip, wheel zoom, keyboard shortcuts)
  9. `web/main.js` (Render loop, event listeners, test harness hooks on `window`)
  10. Centralized mutable state in `web/state.js` and element lookups in `web/dom.js`. Replaced all inline `onclick` attributes.
- **Task 4 (Engine Sees History)**: Added optional `history` parameter (UCI move sequence) to the bridge contract (`compute_ai_move` and `compute_hint`) and engine search (`build_board` and `choose_move`). Repetition detection, avoidance when winning, and claiming when losing were verified with automated pytest tests.
- **Task 5 (Promotion Dialog)**: Replaced pre-move toolbar piece selector with an interactive in-place modal dialog (`#promo-modal`) shown when a human pawn reaches the 8th/1st rank.
- **Task 6 (Surface Failures)**: Created non-blocking animated toast notifications (`web/toast.js` and `#toast-container`) and contextual console logging when the AI bridge errors or produces invalid moves, gracefully falling back to a legal move.
- **Task 7 (Features, One PR / Commit Each)**:
  - **7.1 PGN/FEN Export & FEN Import**: Modal archive for copying FEN / PGN and loading arbitrary valid FEN strings with generation invalidation and board resync.
  - **7.2 Resign & Draw Offer vs AI**: Resign button and AI draw evaluation (declines during opening or when holding material advantage; accepts when equal/losing).
  - **7.3 Optional Clocks**: Selectable time controls (None / 5 min / 10 min blitz/rapid) with active countdown on animation frames and flag fall losses.
  - **7.4 Persisted Settings via `localStorage`**: Safely persists `aiDepth`, `humanColor`, `shadowHigh`, and `sfx.muted` across sessions inside try/catch blocks (`web/settings.js`).
  - **7.5 Move-List Replay**: Clickable move ledger entries and keyboard arrow navigation (Left/Right) allowing players to inspect previous board positions with gold move highlights, with instant return to live play upon clicking the board.
- **Task 8 (Packaging)**: Configured PyInstaller specification (`wizards_chess.spec`) bundling `web/` assets (`--add-data "web;web"`). Verified that `INDEX` resolves from `sys._MEIPASS` via an automated `--smoke-test` suite.

---

## 2. Resolution of Module Loading

- **Problem**: When pywebview loads an HTML page from a `file://` URI, modern WebViews (WebKit / Chromium / Edge WebView2) enforce strict CORS policies that block `<script type="module">` from fetching imported `.js` files.
- **Resolution**: Configured pywebview's built-in HTTP server in `app.py`:
  ```python
  webview.start(http_server=True)
  ```
  This serves the `web/` directory over local HTTP (`http://127.0.0.1:<port>/`), enabling standard browser ES module resolution (`import` / `export`) without requiring an ahead-of-time bundler (such as esbuild or webpack).
- **Test Harness Compatibility**: For headless Playwright tests running against local files, Chromium was launched with `--allow-file-access-from-files` in `tests/visual_regression.mjs`.

---

## 3. Real Machine Execution

- **Yes, the application was run and tested on a real machine** (Windows 11 x64, Python 3.12, Node.js 24, Chromium / SwiftShader WebGL).
- **Test Suites Verified Green**:
  - `python -m pytest tests -q`: 14 passed (100%).
  - `npm test`: 31 passed (100% across all rule, promotion, error handling, and feature suites).
  - `npm run lint`: 0 errors, 0 warnings.
  - `npm run test:visual`: all 3 camera/selection baseline screenshots matched within tolerance (< 2% diff).
  - Standalone executable smoke test: `dist/wizards_chess.exe --smoke-test` verified clean launch and asset extraction from `sys._MEIPASS`.
