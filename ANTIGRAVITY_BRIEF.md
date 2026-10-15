# Antigravity Implementation Brief — Wizard's Chess

## Summary
Desktop 3D chess (Python + pywebview + three.js). Rules, AI, rendering and input all work today. The remaining work is **structural**: `web/game.js` is one 1,583-line global-scope file, there is no CI, and a handful of features and one AI weakness are missing. Behaviour must be preserved while restructuring.

## Reference docs
- Architecture and **invariants you must not break**: `docs/ARCHITECTURE.md`
- State model: `docs/DATA_MODEL.md`
- JS⇄Python bridge: `docs/API_CONTRACT.md`

## What's already built (Claude did this; don't redo)
- Full rules via chess.js, AI via `engine.py` (negamax, alpha-beta, quiescence, PSTs, mate-distance, jitter), play-as-Black, hints, undo/reset, draw/mate modal.
- Stale-AI guard (`gen`), geometry/material caches, click-vs-orbit input, shadow-quality toggle.
- Tests that pass today: `python -m pytest tests -q` (8 pass, 1 xfail) and `npm test` (6 pass).

## Task list (in order — each task must leave tests green and the game playable)
0. **Baseline.** `git init`, commit as-is. Add `README.md` (run, test, package). Install eslint with the existing `.eslintrc.json` and make `npx eslint web/game.js` pass with 0 errors. Add a CI workflow running pytest, `npm test`, eslint.
1. **Visual regression harness.** Using headless Chromium (flags: `--use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader --ignore-gpu-blocklist`; page load can be slow, use `wait_until="commit"` + a fixed wait), script screenshots of: start position at camera distances 9 and 25; a selected pawn (`handleSquareClick('e2')`). Save as baselines. Every refactor step must match them within tolerance.
2. **Verify module loading first (risk).** ES modules from a `file://` page are likely blocked in the webview. Test `<script type="module">` under pywebview. If it fails, serve `web/` with `webview.start(http_server=True)` or bundle with esbuild into one file. Decide, record in ARCHITECTURE.md, then continue.
3. **Split `game.js` into modules** in this order, extracting only (no behaviour change): `audio.js` → `textures.js` + `materials.js` → `cathedral.js` → `pieces.js` → `board.js` (tiles, markers) → `input.js` → `hud.js` → `camera.js` → `main.js`. Replace the ~23 top-level `let`s with one `state` object exported from `state.js`. Replace inline `onclick="..."` (13 in `index.html`) with `addEventListener` bindings and put DOM ids in one `dom.js` lookup. Keep `THREE` and `Chess` as globals (vendored UMD).
4. **Engine sees history.** Add optional `history` to the bridge (see API_CONTRACT "Planned change"), thread it through `choose_move` so `board.is_repetition` works, and remove the `xfail` on `test_engine_can_see_repetition_history`. Add a test where the engine avoids/claims a repetition.
5. **Promotion dialog.** Replace the pre-move `promoPiece` toolbar with a dialog shown when a pawn reaches the last rank (human moves only). Add a test for the UI state transition.
6. **Surface failures.** If the bridge errors or returns invalid moves, show a non-blocking toast (still fall back to a random legal move). Log to console with context.
7. **Features, one PR each:** PGN/FEN export and FEN import; resign + draw offer vs AI; optional clocks; persisted settings (AI level, side, shadows, mute) via `localStorage` in try/catch; move-list replay.
8. **Packaging.** PyInstaller spec including `--add-data "web;web"`; smoke-test the built app starts and `INDEX` resolves from `sys._MEIPASS`.

## Conventions
- JS: ES2021, 2-space indent, no new globals, `camelCase` functions, `UPPER_SNAKE` constants. Python: PEP 8, type hints on bridge methods.
- Errors: bridge methods return `null` and log; never throw across the bridge. UI always falls back to a legal move.
- Tests: Python in `tests/test_*.py`; JS in `tests/*.test.mjs`. A bug fix gets a regression test.
- Commits: one task per commit/PR, message starts with the task number.

## Explicitly out of scope / deferred
- **Colour pipeline.** The scene is washed-out lavender because three r128 treats hex as linear while the renderer outputs sRGB. Fixing it (`outputEncoding`, light retune) changes the whole look. **Do not do this without the owner's approval.**
- Online/LAN multiplayer, accounts, opening books, stronger AI (>depth 4), replacing procedural pieces with imported models.

## Notes
- Do **not** mutate or `dispose()` meshes' geometry/materials from `cg()`/`cmat()`; they are shared.
- Tile materials are per-tile clones on purpose (per-tile `emissive`).
- The engine's search is pure Python; Master takes ~3 s in busy middlegames. Don't raise depth without profiling.
- Markers in code: `TODO(antigravity)` is not used yet; add it where you leave work unfinished.
