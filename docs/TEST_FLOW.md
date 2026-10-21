# TEST_FLOW.md — automated browser test flow and test automation plan

Goal: one command opens the app in a real Chromium tab, plays it like a person (real mouse clicks on the 3D board, key presses, toolbar buttons, modals, reloads), and reports PASS/FAIL per scenario with screenshots. The same flow is written as manual steps so an agent with its own browser tool can follow it.

## Test layers (what runs when)
| Layer | Command | Covers |
|---|---|---|
| Python unit | `python -m pytest tests -q` | engine, packaging spec |
| JS unit | `npm test` | rules, match flow, promotion, features, GPU resources |
| Lint | `npm run lint` | `web/*.js` |
| Visual regression | `npm run test:visual` | screenshots vs `tests/visual_baselines/` (5% tolerance) |
| **E2E flow (this doc)** | `npm run test:e2e` | everything a player does in a browser tab |
| Everything | `npm run test:all` | lint, unit, visual, e2e, pytest |
| Real window | `npm run test:e2e -- --headed --python --real-app` | desktop window launches and stays open |

## Deliverables
1. `tests/static_server.mjs`: dependency-free static server for `web/`. Export `startStaticServer(webRoot, port = 0)`. CLI via `npm run serve` (port 8080) prints the app URL and the `?wctest` URL. Reuse it in `tests/visual_regression.mjs` and delete the duplicate there.
2. `tests/e2e_flow.mjs` with npm scripts `test:e2e` and `test:all` (lint + test + test:visual + e2e + pytest).
   - Flags: `--headed`, `--slowmo=MS`, `--keep-open`, `--only=a,b`, `--python` (also run pytest and `python app.py --smoke-test`), `--real-app` (launch `python app.py`, assert it stays open 12 s with no stderr errors), `--base-url=URL`.
   - Env: `CHROMIUM_PATH`.
   - Output: `tests/e2e_output/` (screenshots, `report.md`, `report.json`), listed in `.gitignore`.
   - Exit code 1 on any failure. Each scenario runs in a fresh browser context.
3. Link this file from `README.md` and `AGENTS.md`. Add `npm run test:e2e` to `.github/workflows/ci.yml` only if it is reliable headless.

## Test support in the app (only behind `?wctest`; nothing new on `window` in production)
- `window.squareToScreen(sq, height, dx, dz)`: board square to screen coordinates.
- `window.findClickPoint(sq)`: tries heights and offsets and returns a point where `getSquareUnderPointer()` really returns `sq`. Use it for every board click.
- `?wctest&fast`: raise the per-frame time clamp (`state.maxDt`, default 0.05) so animations finish in a frame or two.
- `<link rel="icon" href="data:,">` in `index.html`.

## Fake Python bridge (injected before page scripts)
Replace `window.pywebview.api` with `compute_ai_move`, `compute_hint`, `toggle_fullscreen`. Record every call (`fen`, `depth`, `history`, `startFen`). Modes switchable at runtime: `first-legal`, `fixed` (given move), `throw`, `null`, `illegal` (e2e5), configurable delay. One scenario runs with no `window.pywebview` at all.

## Scenarios (assert what is listed; on failure give a clear message plus a screenshot)
1. **boot**: no console or page errors, no failed or 4xx requests; canvas fills the window; 22 toolbar buttons; 32 pieces and 64 squares; start position; telemetry shows an FPS value; render loop alive.
2. **production page** (no `?wctest`): none of `state`, `handleSquareClick`, `resetGame`, `importFen`, `squareToScreen` on `window`.
3. **layout** at 1100×650, 1600×940, 1920×1080: every toolbar button and the footer fully on screen, Move Chronicle panel on screen, no horizontal scroll, toolbar under 35% of window height.
4. **mouse moves** (two-player): click e2 selects, targets e3/e4; click empty square deselects; e2-e4 plays; ledger shows `e4`; turn passes to Black; selecting the other side's piece or an illegal target does nothing; e7-e5 and Nf3 play.
5. **AI reply**: bridge got depth 2, history `["e2e4"]`, startFen null; reply is played; Novice and Master chips send depth 1 and 3.
6. **AI failures**: modes `throw`, `null`, `illegal` each still produce a legal reply and a toast containing "fell back". No-bridge page: AI still replies.
7. **stale AI reply**: start a 3.5 s reply, click Reset (separately: press Z) before it arrives; afterwards history is empty and the board is the start position.
8. **play Black**: after clicking Black the AI makes White's first move; camera yaw about π; human can play Black and the AI answers.
9. **rules through real clicks**: castling kingside (king g1, rook f1); en passant (captured pawn gone from board and 3D scene); human promotion opens `#promo-modal` and Knight promotes; AI promotion shows no dialog; fool's mate shows `CHECKMATE`; modal Undo Last, Close and Play New Match work and the board is locked after mate; stalemate shows `MATCH DRAWN` with "STALEMATE".
10. **match controls**: Resign vs AI shows `RESIGNATION` and locks the board; AI declines an early draw offer (toast "declines"); two-player draw accepted (`DRAW AGREED`); two-player Resign makes the side to move lose.
11. **clocks**: 5m shows `05:00` both; clock idle before first move; after e4 and `tickClock(30)` Black shows `04:30`, White untouched; `tickClock(1000)` gives `TIME EXPIRED`, White wins.
12. **PGN/FEN dialog**: Export FEN equals current FEN; Export PGN contains `1. e4`; bad input (`not a fen`, no black king, two black kings) gives a toast and leaves the game unchanged; a good FEN loads, closes the dialog and sets `state.startFen`.
13. **replay**: ArrowLeft shows the earlier position, clicking a ledger move jumps, ArrowRight steps forward, clicking the board returns to live play, history never changes.
14. **hotkeys and camera**: Space flips by π; 1 and 3 set pitch 0.66 and 1.44; wheel zooms; right-drag orbits; left-drag orbits without selecting; R needs a second press (status `PRESS R AGAIN TO RESET`); Z undoes; M toggles the mute icon; Space after clicking a toolbar button does not trigger that button.
15. **hint and fullscreen**: hint button highlights the fake engine's move and selects the piece; fullscreen button calls `toggle_fullscreen` on the bridge.
16. **settings**: change level, shadows, mute; reload; all restored (including active chip and label). Corrupt saved settings (`{"aiDepth":"DROP TABLE",...}`) and unparsable JSON both fall back to defaults.

## Reference: UI ids and strings
Ids: `gl-canvas, status-text, turn-badge, ai-group (data-depth 0-3), side-group (data-side w/b), time-group (data-time 0/300/600), btn-cam-white/angle/top/flip, btn-hint, btn-undo, btn-reset, btn-draw, btn-resign, btn-io, mute-btn, quality-btn, btn-fullscreen, clock-white/black, ledger-list (.ledger-san[data-ply]), telemetry, end-modal (class "visible"), modal-title, modal-sub, modal-btn-reset/undo/close, promo-modal (.promo-btn[data-promo=q|n|r|b]), io-modal, io-textarea, btn-export-fen, btn-export-pgn, btn-import-fen, btn-io-close, toast-container (.toast)`.
Strings: `CHECKMATE`, `MATCH DRAWN`, `DRAW AGREED`, `RESIGNATION`, `TIME EXPIRED`, `PRESS R AGAIN TO RESET`, `PONDERING...`, `DRAW BY STALEMATE`.
Hotkeys: Space flip, 1/2/3 presets, Z undo, R (double press) reset, H hint, M mute, ArrowLeft/Right replay.

## Pitfalls (already hit once)
- Prove the render loop with `state.lastTime`, not `state.frameCount`.
- Wait for "settled" (see `PROGRESS.md` Gotchas), never a fixed sleep.
- Use a 1366×860 viewport and seed `localStorage {shadowHigh:false}` for speed; the settings scenario must not.
- Check `document.elementFromPoint` before a real click: a HUD panel may cover the square.

## Acceptance (do all, report results in `docs/PROGRESS.md`)
a. `npm run test:e2e` passes headless; with `--headed --slowmo=300` it visibly plays through.
b. **Mutation check** (temporarily break, confirm the named scenario FAILS, restore):
   - remove `state.gen++` from `resetGame` → scenario 7
   - make `aiTurn()` always return false → scenarios 5 and 8
   - flip the `isLight` parity in `board.js` → scenario 9 or a screenshot diff
   - set `.top-bar` back to `flex-wrap: nowrap` → scenario 3
c. `npm run test:all` passes.
d. On a machine with a display: `npm run test:e2e -- --headed --python --real-app`, report the real-window result.
e. Separate commits: server + hooks, e2e script, docs. No change to game behaviour or colours.

## Manual version (for an agent driving its own browser tab)
1. `npm run serve`; open `http://127.0.0.1:8080/index.html?wctest`.
2. Walk scenarios 1–16 above in order, using the test hooks from the console. For each, record PASS/FAIL and a screenshot in `tests/e2e_output/`.
3. Open `http://127.0.0.1:8080/index.html` (no `?wctest`) and confirm scenario 2.
4. Copy results into `docs/PROGRESS.md`.
