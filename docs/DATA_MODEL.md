# State Model — Wizard's Chess

No database. All state lives in memory in the single `state` object exported from `web/state.js`; derived render objects (`pieceMeshes`, `squareMeshes`, ...) live there too. Only four settings are persisted (see below).

## Authoritative game state
| Name | Type | Meaning |
|---|---|---|
| `game` | `Chess` (chess.js) | Position, history, turn. The only source of truth for legality. |
| `humanColor` | `'w' \| 'b'` | Side controlled by the human |
| `aiDepth` | `0 \| 1 \| 2 \| 3` | 0 = two-player; 1/2/3 = Novice/Adept/Master |
| `startFen` | `string \| null` | FEN the current game began from (`null` = standard start). Set by `importFen`, cleared by `resetGame`; sent to the engine with the move history |
| `matchResult` | `{status,title,sub} \| null` | Set by resign, draw agreement, or flag fall; blocks input until reset/undo |
| `pendingPromotion` | `{from,to} \| null` | Human pawn move waiting for the promotion dialog |
| `timeControl`, `clockWhite`, `clockBlack` | seconds | 0 = no clock |
| `replayPly`, `replayGame` | `number \| null`, `Chess \| null` | Move-list replay (read-only view of an earlier position) |

## Interaction state
| Name | Type |
|---|---|
| `selectedSq` | `string \| null` (e.g. `"e2"`) |
| `validMoves` | chess.js verbose moves for `selectedSq` |
| `lastMove`, `hintMove` | `{from, to, ...} \| null` |
| `isAnimating`, `activeAnim` | move animation in progress |
| `gen`, `aiPendingGen` | request generation counters (stale-result guard) |
| `pointerState` | `{id, button, startX, startY, lastX, lastY, orbiting} \| null` |

## View state
`camYaw/Pitch/Dist` and `target*` (camera easing), `shakeAmt`, `shadowHigh`, `sfx.muted`.

## Derived render objects (rebuilt from game state, never the source of truth)
`pieceMeshes: {sq → Group}`, `squareMeshes: {sq → Mesh}`, `markerGroup`, `shards`.

## Invariants
1. `pieceMeshes` keys equal the occupied squares in `game` after `syncBoardFull()`.
2. `validMoves` is empty whenever `selectedSq` is null.
3. `isAnimating` is true from `executeMoveAnimated` start until the animation completes; input and AI are ignored meanwhile.
4. Any change to the position outside a normal move (undo, reset, side change) must `gen++`.

## Persisted settings (`localStorage` key `wizards_chess_settings`)
`{ aiDepth: 0|1|2|3, humanColor: 'w'|'b', shadowHigh: boolean, muted: boolean }`. Each field is validated individually on load; anything else is ignored and the default kept. Reads/writes are wrapped in try/catch because storage can be unavailable.

## Extra invariants
5. `startFen` is non-null only after a FEN import and must be reset with the game; engine calls must pass it together with the history.
6. Test hooks on `window` exist only with `?wctest`.
