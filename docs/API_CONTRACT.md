# Bridge Contract — JS ⇄ Python

Transport: pywebview `js_api`. JS calls `await window.pywebview.api.<method>(...)`; Python returns JSON-serialisable values. Calls are only valid once `window.pywebview.api` exists (absent when opened in a plain browser — JS must fall back).

Conventions
- Squares are lowercase algebraic (`"e2"`).
- A method that cannot answer returns `null`; it never throws across the bridge (Python catches and logs to stderr).
- The current position is passed as **FEN**. The game so far is passed as `history` (UCI moves) plus `start_fen`.

```ts
interface EngineMove {
  from: string;            // "e2"
  to: string;              // "e4"
  promotion: 'q'|'r'|'b'|'n';   // always present; only meaningful for pawn moves to the last rank
  score: number | null;    // centipawns, side-to-move relative; ±(100000 - ply) means forced mate
}
```

## `compute_ai_move(fen: string, depth: number, history?: string[], start_fen?: string | null): EngineMove | null`
- `depth` is clamped server-side to 1..4 (UI sends 1–3). Time budget 6 s, iterative deepening.
- Per-level jitter (cp): `{1: 40, 2: 15, 3: 5}`. Never jitters away from a forced mate.
- Returns `null` for game-over positions, bad FEN, or internal error.
- `history`/`start_fen`: see "Game history" below. Both optional; the old `(fen, depth)` call still works.
- JS must validate the result against `game.moves()` and fall back to a random legal move.

## `compute_hint(fen: string, history?: string[], start_fen?: string | null): EngineMove | null`
- Depth 2, jitter 0, 3 s budget.

## `toggle_fullscreen(): true`

## Game history
`history` is the list of UCI moves (`"e2e4"`, `"e7e8q"`) played from `start_fen`; `start_fen` is `null`/omitted for the standard start position and the imported FEN otherwise. The engine replays them and **uses the result only if it lands exactly on `fen`**. Inconsistent, illegal or stale history is ignored without error (the engine plays from the plain FEN, just without repetition awareness). With a valid history, a move that repeats an earlier position is scored as a draw, so the engine avoids it when ahead and takes it when behind.
