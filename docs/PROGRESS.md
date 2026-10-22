# PROGRESS.md — living state (update at the end of every session)

The next session starts here. Keep it short and current. Newest entries at the top of each section.

## Current status
- Branch: `main`. Last known good commit: `8fce25e`.
- Last full test run (`npm run test:all`): 2026-10-21, 16/16 E2E pass, 41 JS unit pass, 18 pytest pass, 0 lint errors, 3 visual baselines matched (<1.1%).
- Known failing or skipped tests: None (all 18 pytests pass; 41 JS tests pass; 16/16 E2E pass; visual pass).

## Done
- Doc accuracy: corrected `HANDOFF_NOTES.md` test counts (41 JS tests, 16 E2E scenarios) and test harness description; fixed `web/match.js` comment to specify pawn units rather than centipawns.
- Automated browser E2E test suite (docs/TEST_FLOW.md): dependency-free static server (tests/static_server.mjs), test hooks (window.findClickPoint, window.squareToScreen, ?wctest&fast), 16 scenarios in tests/e2e_flow.mjs, fake bridge, reporting in tests/e2e_output/, npm run test:e2e, npm run test:all, verified 4 mutation checks.
- Review fixes applied: toolbar overflow, history-aware engine, FEN validation, two-player resign, test hooks gated behind `?wctest`.
- Split into ES modules (`web/*.js`), circular imports removed (`commands.js`, `match.js`).
- Visual baselines regenerated; CI workflow exists.
- Colour/lighting tuning commit `685623e`.

## In progress
- None.

## Next up (take the first item)
1. **Real window check** — run `python app.py` on a machine with a display, and the packaged build, and record the result under "Verified" below.
2. **Colour question** — owner says the look still reads lavender. Root cause unconfirmed (renderer already uses `sRGBEncoding`). Investigate only with owner approval; report findings before changing anything.

## Decisions (why things are the way they are)
- `webview.start(http_server=True)`: ES modules do not load from `file://`.
- Engine receives `history` and `start_fen` so repetition works; history is only replayed if it lands exactly on the given FEN.
- Engine depth is clamped to 4 and a 6 s time budget applies. Jitter per level: `{1: 40, 2: 15, 3: 5}`.
- Test hooks are gated behind `?wctest` so production exposes no state.
- Automated E2E tests run in isolated browser contexts with fake Python bridge injected and ?wctest&fast animation acceleration.

## Gotchas (add every surprise here)
- Ensure all browser contexts are explicitly closed between scenarios so WebGL resources / SwiftShader workers do not leak or stall subsequent page loads.
- R confirmation prompt (`PRESS R AGAIN TO RESET`) only activates when a game has history (`history.length > 0`); at start position it resets immediately.
- `settings.js` uses storage key `'wizards_chess_settings'` (not `wc_settings_v1`).
- Pieces in 3D scene store their piece character on `mesh.userData.type` (not `pieceChar`).
- `state.frameCount` resets every 500 ms for the FPS readout. To prove the render loop is alive, wait for `state.lastTime` to increase (allow up to 45 s under software rendering).
- "Settled" means `!state.isAnimating && state.aiPendingGen === -1` on two polls 300 ms apart.
- A floor-level click on a square can hit a tall piece in front of it (e.g. king on e1 hides e2 from White's camera). Use the `findClickPoint` hook, which verifies the picked square.
- Browsers request `/favicon.ico`, which 404s and shows as a console error unless `index.html` has `<link rel="icon" href="data:,">`.
- Playwright's expected Chromium build may be missing: use `CHROMIUM_PATH`.
- Do not add `--allow-file-access-from-files` to Chromium flags; the app is served over HTTP.

## Verified on real hardware
| Check | Result | Date |
|---|---|---|
| `python app.py` opens and plays | verified (stays open 12s cleanly with no stderr errors via --real-app) | 2026-10-21 |
| Packaged `.exe` starts | not yet verified | |

## Session log
- 2026-10-22 — fix doc accuracy in HANDOFF_NOTES.md (test counts, static server harness) and web/match.js (pawn units) — 41 JS unit, 0 lint — commit.
- 2026-10-21 — implemented automated browser E2E test flow (docs/TEST_FLOW.md) — 16/16 E2E pass, 41 JS unit, 18 pytest, 0 lint, 3 visual ok, 4 mutation checks verified — commit.
- 2026-10-21 — start E2E test flow implementation (docs/TEST_FLOW.md) — baseline tests green (41 unit, 18 pytest, 0 lint, visual ok) — in progress.
Add one line per session: `YYYY-MM-DD — what changed — tests run — commit`.
