# Bridge Contract — JS ⇄ Python

Transport: pywebview `js_api`. JS calls `await window.pywebview.api.<method>(...)`; Python returns JSON-serialisable values. Calls are only valid once `window.pywebview.api` exists (absent when opened in a plain browser — JS must fall back).

Conventions
- Squares are lowercase algebraic (`"e2"`).
- A method that cannot answer returns `null`; it never throws across the bridge (Python catches and logs to stderr).
- Positions are passed as **FEN** today. See "Planned change" for history.

```ts
interface EngineMove {
  from: string;            // "e2"
  to: string;              // "e4"
  promotion: 'q'|'r'|'b'|'n';   // always present; only meaningful for pawn moves to the last rank
  score: number | null;    // centipawns, side-to-move relative; ±(100000 - ply) means forced mate
}
```

## `compute_ai_move(fen: string, depth: number): EngineMove | null`
- `depth` is clamped server-side to 1..4 (UI sends 1–3). Time budget 6 s, iterative deepening.
- Per-level jitter (cp): `{1: 40, 2: 15, 3: 5}`. Never jitters away from a forced mate.
- Returns `null` for game-over positions, bad FEN, or internal error.
- JS must validate the result against `game.moves()` and fall back to a random legal move.

## `compute_hint(fen: string): EngineMove | null`
- Depth 2, jitter 0, 3 s budget.

## `toggle_fullscreen(): true`

## Planned change (brief task 4)
Add optional `history: string[]` (UCI moves from the start position or a given FEN) to both search methods so the engine can see repetitions. Keep `fen` required and the old call shape working.
