# AGENTS.md — Wizard's Chess (read this first, every session)

This file is the project's memory. Read it fully, then `docs/PROGRESS.md`. Do not re-read the whole codebase: use the file map below and open only what the task needs.

## What this is
Desktop 3D chess. Python 3.10+ `pywebview` shell (`app.py`) serves `web/` over HTTP (`webview.start(http_server=True)`). UI: three.js r128 (global `THREE`), chess.js 0.10.3 (global `Chess`), both vendored in `web/vendor/`. AI: `engine.py` (python-chess, negamax + alpha-beta + quiescence), called through a JS⇄Python bridge.

## Session protocol (this is what stops memory loss)
1. **Start:** read `AGENTS.md`, then `docs/PROGRESS.md`. Run the workflow `/start-session` (or its steps in `.agent/workflows/start-session.md`). Do not start work until the baseline is green.
2. **Work:** one task at a time, taken from "Next up" in `docs/PROGRESS.md`. Read only the docs and files the task needs (map below).
3. **Verify:** run `npm run test:all`. Every bug fix gets a regression test.
4. **End:** run `/end-session`: update `docs/PROGRESS.md` (done, in progress, decisions, gotchas), commit, and stop. If you learn a rule the next session must know, add it to "Gotchas" in `docs/PROGRESS.md`, not to chat.

If this file and the code disagree, trust the code and fix this file in the same commit.

## File map (open only what you need)
| Task touches | Read |
|---|---|
| Module layout, invariants | `docs/ARCHITECTURE.md` |
| `state` fields | `docs/DATA_MODEL.md` and `web/state.js` |
| JS⇄Python calls | `docs/API_CONTRACT.md`, `app.py`, `engine.py` |
| Testing or e2e | `docs/TEST_FLOW.md`, `tests/` |
| Rendering | `web/{cathedral,pieces,board,materials,textures,camera}.js` |
| Input, clicks, hotkeys | `web/input.js`, `web/commands.js` |
| Rules, match flow, clocks | `web/match.js`, `web/commands.js` |
| UI panels, modals, toasts | `web/{hud,toast,dom}.js`, `web/index.html`, `web/style.css` |
| Settings | `web/settings.js` |
| Packaging | `wizards_chess.spec`, `tests/test_packaging.py` |

## Commands
| Purpose | Command |
|---|---|
| Everything (must pass before every commit) | `npm run test:all` |
| Python tests | `python -m pytest tests -q` |
| JS unit tests | `npm test` |
| Lint | `npm run lint` |
| Visual regression | `npm run test:visual` |
| Browser end-to-end flow | `npm run test:e2e` (see `docs/TEST_FLOW.md`) |
| Serve UI in a browser tab | `npm run serve` then open `http://127.0.0.1:8080/index.html` |
| App smoke test | `python app.py --smoke-test` |
| Run the app | `python app.py` |

Headless Chromium needs: `--use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader --ignore-gpu-blocklist`. If Playwright's own browser is missing, set `CHROMIUM_PATH`. Software rendering is slow (seconds per frame): wait on state, never on fixed sleeps.

## Invariants (breaking one is a bug even if tests pass)
- a1 is a dark square: `isLight = (file + rank) % 2 === 0`.
- Frame top y = −0.02, trim top −0.008, tiles 0. Camera near 0.5, fog 0.008 (prevents z-fighting).
- Stale AI replies are dropped: `state.gen`, `state.aiPendingGen`, FEN compare. `resetGame` and undo must bump `state.gen`.
- Geometries and materials from `cg()` / `cmat()` are **shared**: never `dispose()` or mutate them. Tile materials are per-tile clones on purpose.
- Highlights are emissive (`tintTile`), not colour swaps.
- Bridge methods return `null` and log on error; they never throw. JS validates every AI move for legality and falls back to a random legal move (toast "fell back to random legal move" only when a bridge exists).
- Test hooks live on `window` **only** with `?wctest`. Production exposes no globals beyond `THREE`/`Chess`.
- `state.startFen` is set on FEN import and cleared on reset.
- No new globals. No inline `onclick`. DOM ids come from `dom.js`.
- Settings in `localStorage` key `wizards_chess_settings`, every field whitelisted and validated, all access in try/catch.
- Do not change the colour/lighting pipeline without the owner's approval (it was recently tuned).

## Working rules
- **Simplest thing that works.** If a skill such as `ponytail` (laziest working solution, YAGNI, standard library first) is available, use it for any coding, refactor or dependency choice. If it is not available, apply the same principle. It never overrides the invariants or the test requirements above.
- Other skills (frontend-design, pdf, xlsx, and so on) are allowed when the task actually needs them. Say which skill you used in the commit body.
- Never weaken or delete a test to make it pass. If a test is wrong, fix it and explain why in the commit.
- Do not push to `main` directly if branch protection exists; use a branch per task.
- Commits: one task per commit, message `type: summary`, body lists tests run.
- Leave `TODO(antigravity)` where work is unfinished, and also list it in `docs/PROGRESS.md`.
- Ask the owner before: changing look and feel, adding dependencies, changing the bridge contract, raising AI depth past 4.

## Definition of done
`npm run test:all` green, docs updated if behaviour or structure changed, `docs/PROGRESS.md` updated, committed.
