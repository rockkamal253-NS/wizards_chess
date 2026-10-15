# State Model — Wizard's Chess

No database. State lives in memory in `web/game.js` as top-level variables. This is the model Antigravity should preserve when it introduces a store (see brief, task 3).

## Authoritative game state
| Name | Type | Meaning |
|---|---|---|
| `game` | `Chess` (chess.js) | Position, history, turn. The only source of truth for legality. |
| `humanColor` | `'w' \| 'b'` | Side controlled by the human |
| `aiDepth` | `0 \| 1 \| 2 \| 3` | 0 = two-player; 1/2/3 = Novice/Adept/Master |
| `promoPiece` | `'q'\|'r'\|'b'\|'n'` | Promotion choice made *before* the move (to be replaced by a dialog) |

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
