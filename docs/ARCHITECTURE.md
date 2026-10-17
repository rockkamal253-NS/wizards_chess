# Architecture — Wizard's Chess (Gothic Cathedral)

## Overview
A desktop 3D chess game. A Python process hosts a native window (pywebview) that renders a three.js scene; a Python engine supplies AI moves and hints over a small JS↔Python bridge. Legality in the UI is decided by chess.js; the AI uses python-chess.

## Stack
| Layer | Choice | Why |
|---|---|---|
| Shell | Python 3.10+, pywebview | Native window without Electron; `app.py` is ~60 lines |
| Rendering | three.js r128 (vendored, global `THREE`) | Procedural pieces/materials; no asset pipeline |
| UI rules | chess.js 0.10.3 (vendored, global `Chess`) | Legal moves, SAN, draw detection |
| AI | python-chess + hand-written negamax (`engine.py`) | Testable in isolation, no UI imports |
| Tests | pytest, `node --test`, Playwright visual regression | `tests/`; CI runs lint + unit tests |
| Persistence | `localStorage` settings only | Game state is not saved |

## System diagram
```mermaid
graph TD
  subgraph Python process
    APP[app.py: NativeChessBridge] --> ENG[engine.py: choose_move]
  end
  subgraph Webview web/ - served over local HTTP by pywebview
    HTML[index.html + style.css] --> MAIN[main.js]
    MAIN --> INPUT[input.js] & HUD[hud.js] & CAM[camera.js] & BOARD[board.js]
    INPUT & HUD & BOARD & CAM --> STATE[(state.js)]
    BOARD --> PIECES[pieces.js] & MAT[materials.js]
    MAIN --> CATH[cathedral.js] --> MAT
    INPUT --> RULES[chess.js: state.game]
    INPUT -- "window.pywebview.api.*" --> APP
  end
```

## Modules (all under `web/`)
| Module | Responsibility | Depends on |
|---|---|---|
| `state.js` | The single mutable state store (`state`); see `DATA_MODEL.md` | chess.js global |
| `dom.js` | One lookup table for every element id the code uses | – |
| `audio.js` | `CathedralAudio` synth, `sfx` instance | – |
| `textures.js` | Procedural HDRI and marble/obsidian canvas textures | three |
| `materials.js` | renderer/scene/camera, `cg()`/`cmat()` caches, shared materials, `SQ_SIZE` | textures |
| `cathedral.js` | Room, braziers, trim, lights (`buildCathedral`) | materials |
| `pieces.js` | One 3D mesh per piece type/colour (`buildPieceMesh`) | materials |
| `board.js` | Tiles, emissive highlights (`tintTile`), markers, `syncBoardFull`, `clearSelection`, capture shards | materials, pieces, state |
| `input.js` | Raycast picking, click-vs-orbit pointer machine, promotion dialog, `executeMoveAnimated`, `triggerAI`, hints | audio, board, dom, hud, materials, state, toast |
| `commands.js` | Game orchestration: `undoMove`, `resetGame`, `resignGame`, `offerDraw`, `importFen`, clocks, replay | audio, board, dom, hud, input, match, materials, settings, state, toast |
| `match.js` | Pure rules/match calculations: clocks, material evaluation, draw/resign outcomes, FEN validator | – |
| `hud.js` | Status, ledger, captured trays, modals, clock display, quality/audio toggles | audio, board, dom, match, settings, state |
| `camera.js` | Orbit, presets, hotkeys | commands, dom, hud, state |
| `settings.js` | Whitelisted `localStorage` persistence (try/catch everywhere) | state, audio |
| `toast.js` | Non-blocking notifications | – |
| `gpu.js` | `shortGpuName()` for the footer (unit-tested) | – |
| `main.js` | Boot, render loop, event wiring; test hooks only with `?wctest` | everything |
| `engine.py` | negamax, alpha-beta, quiescence, MVV-LVA, PSTs, history-aware repetition | python-chess |
| `app.py` | Window, bridge, bundle-safe paths | engine |

## Folder structure
```
wizards_chess/
├── app.py  engine.py  requirements.txt  package.json  wizards_chess.spec
├── README.md  HANDOFF_NOTES.md  ANTIGRAVITY_BRIEF.md  docs/
├── tests/  test_engine.py  test_packaging.py  test_*.test.mjs  visual_regression.mjs  visual_baselines/
└── web/  index.html  style.css  main.js  state.js  dom.js  audio.js  textures.js  materials.js
          cathedral.js  pieces.js  board.js  input.js  commands.js  match.js  hud.js  camera.js
          settings.js  toast.js  gpu.js  vendor/{three.min.js,chess.js}
```

## Key decisions & invariants (do not undo without discussion)
- **Board parity:** a1 is a dark square (`isLight = (f + r) % 2 === 0`). Wrong parity makes queens stand on the wrong colour.
- **No coplanar surfaces:** frame top −0.02, gold trim top −0.008, tiles at 0. Coplanar layers z-fight and flicker with zoom.
- **Camera near plane 0.5**, fog density 0.008: protects depth precision.
- **Stale-result guard:** every async AI/hint result is dropped unless `gen` and `game.fen()` are unchanged. `undoMove`/`resetGame` bump `gen`.
- **Never trust the bridge:** AI moves are validated against `game.moves()` before being played.
- **Shared GPU resources:** geometry/materials from `cg()`/`cmat()` are shared. Do not mutate or `dispose()` them in place. Tile materials are per-tile clones because highlights use per-tile `emissive`.
- **Highlights are emissive**, not albedo tints.
- **Two rule engines** (chess.js, python-chess) must agree; the UI is the source of truth, Python only suggests.
- **Module loading & webview server:** ES modules (`<script type="module">`) are blocked under `file://` by WebView CORS policies. To enable clean modular ES code without requiring an extra build/bundle pipeline, `app.py` serves `web/` using pywebview's built-in HTTP server (`webview.start(http_server=True)`). The visual regression test serves `web/` over HTTP the same way (no `--allow-file-access-from-files`).
- **Test hooks are opt-in:** `window.state`, `handleSquareClick`, `camDist`, etc. exist only when the page is opened with `?wctest`. Production adds nothing to `window`.
- **Engine history needs the start position:** the bridge sends `history` (UCI moves) plus `start_fen` (null = standard start). `build_board` replays them and uses the result only if it lands exactly on the current FEN; otherwise it silently falls back to the plain position. Never replay history onto the *current* FEN.
- **FEN import is verified, not trusted:** chess.js silently drops pieces it cannot place (e.g. a second king), so `importFen` compares the loaded placement with the typed text and requires exactly one king per side.
- **Toolbar layout:** `.hud-root` has `grid-template-columns: minmax(0, 1fr)` and the toolbar wraps. Without the `minmax(0, ...)` the grid column grows to the toolbar's content width and pushes controls and the right-hand panel off-screen.
- **Acyclic module dependencies:** Circular dependency between `input.js` and `hud.js` eliminated by extracting `commands.js` (orchestration) and `match.js` (pure rules logic testable without DOM).

## Known structural debt
- *Resolved:* `commands.js` and `match.js` were extracted, eliminating the previous `input.js` ⇄ `hud.js` circular import and enabling pure headless match tests.
