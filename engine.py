"""Chess AI for Wizard's Chess: negamax + alpha-beta, quiescence, MVV-LVA ordering.

Pure python-chess, no UI dependencies, so it can be tested on its own.
Scores are in centipawns from the point of view of the side to move.
"""
import random
import time

import chess

MATE = 100_000
INF = 10**9
MAX_DEPTH = 4          # hard server-side clamp
TIME_BUDGET = 6.0      # seconds per move; iterative deepening keeps the last finished depth

PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,  # king is never captured; mate is handled by search
}

# Tables are written from White's point of view, rank 8 first (a8 = index 0).
PST = {
    chess.PAWN: [
        0, 0, 0, 0, 0, 0, 0, 0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
        5, 5, 10, 25, 25, 10, 5, 5,
        0, 0, 0, 20, 20, 0, 0, 0,
        5, -5, -10, 0, 0, -10, -5, 5,
        5, 10, 10, -20, -20, 10, 10, 5,
        0, 0, 0, 0, 0, 0, 0, 0,
    ],
    chess.KNIGHT: [
        -50, -40, -30, -30, -30, -30, -40, -50,
        -40, -20, 0, 0, 0, 0, -20, -40,
        -30, 0, 10, 15, 15, 10, 0, -30,
        -30, 5, 15, 20, 20, 15, 5, -30,
        -30, 0, 15, 20, 20, 15, 0, -30,
        -30, 5, 10, 15, 15, 10, 5, -30,
        -40, -20, 0, 5, 5, 0, -20, -40,
        -50, -40, -30, -30, -30, -30, -40, -50,
    ],
    chess.BISHOP: [
        -20, -10, -10, -10, -10, -10, -10, -20,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -10, 0, 5, 10, 10, 5, 0, -10,
        -10, 5, 5, 10, 10, 5, 5, -10,
        -10, 0, 10, 10, 10, 10, 0, -10,
        -10, 10, 10, 10, 10, 10, 10, -10,
        -10, 5, 0, 0, 0, 0, 5, -10,
        -20, -10, -10, -10, -10, -10, -10, -20,
    ],
    chess.ROOK: [
        0, 0, 0, 0, 0, 0, 0, 0,
        5, 10, 10, 10, 10, 10, 10, 5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        0, 0, 0, 5, 5, 0, 0, 0,
    ],
    chess.QUEEN: [
        -20, -10, -10, -5, -5, -10, -10, -20,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -10, 0, 5, 5, 5, 5, 0, -10,
        -5, 0, 5, 5, 5, 5, 0, -5,
        0, 0, 5, 5, 5, 5, 0, -5,
        -10, 5, 5, 5, 5, 5, 0, -10,
        -10, 0, 5, 0, 0, 0, 0, -10,
        -20, -10, -10, -5, -5, -10, -10, -20,
    ],
}
KING_MID = [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
]
KING_END = [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
]


class _Timeout(Exception):
    pass


def evaluate(board: chess.Board) -> int:
    """Static evaluation, side-to-move relative. Terminal states are handled by the search."""
    pieces = board.piece_map()
    queens = sum(1 for p in pieces.values() if p.piece_type == chess.QUEEN)
    endgame = queens == 0 or len(pieces) <= 10
    king_table = KING_END if endgame else KING_MID

    score = 0
    for sq, p in pieces.items():
        idx = sq ^ 56 if p.color == chess.WHITE else sq
        if p.piece_type == chess.KING:
            v = king_table[idx]
        else:
            v = PIECE_VALUES[p.piece_type] + PST[p.piece_type][idx]
        score += v if p.color == chess.WHITE else -v
    return score if board.turn == chess.WHITE else -score


def _order_key(board: chess.Board):
    def key(m: chess.Move) -> int:
        s = 0
        if board.is_capture(m):
            victim = board.piece_at(m.to_square)
            vt = victim.piece_type if victim else chess.PAWN  # en passant
            attacker = board.piece_type_at(m.from_square)
            s += 10 * PIECE_VALUES[vt] - PIECE_VALUES.get(attacker, 0) + 10_000
        if m.promotion:
            s += PIECE_VALUES[m.promotion] + 9_000
        return s
    return key


class Searcher:
    def __init__(self, deadline: float):
        self.deadline = deadline
        self.nodes = 0

    def _tick(self):
        self.nodes += 1
        if self.nodes & 1023 == 0 and time.monotonic() > self.deadline:
            raise _Timeout

    def quiesce(self, board, alpha, beta, qdepth=4):
        self._tick()
        stand = evaluate(board)
        if stand >= beta:
            return stand
        alpha = max(alpha, stand)
        if qdepth == 0:
            return alpha
        caps = sorted(board.generate_legal_captures(), key=_order_key(board), reverse=True)
        for m in caps:
            board.push(m)
            score = -self.quiesce(board, -beta, -alpha, qdepth - 1)
            board.pop()
            if score >= beta:
                return score
            alpha = max(alpha, score)
        return alpha

    def negamax(self, board, depth, alpha, beta, ply):
        self._tick()
        moves = list(board.legal_moves)
        if not moves:
            # prefer faster mates: the deeper (larger ply) the mate, the less it is worth
            return -(MATE - ply) if board.is_check() else 0
        if board.is_insufficient_material() or board.halfmove_clock >= 100 or board.is_repetition(2):
            return 0
        if depth <= 0:
            return self.quiesce(board, alpha, beta)

        moves.sort(key=_order_key(board), reverse=True)
        best = -INF
        for m in moves:
            board.push(m)
            score = -self.negamax(board, depth - 1, -beta, -alpha, ply + 1)
            board.pop()
            if score > best:
                best = score
            alpha = max(alpha, score)
            if alpha >= beta:
                break
        return best

    def root(self, board, depth, jitter):
        """Return (best_score, [candidate moves within `jitter` cp of the best])."""
        moves = list(board.legal_moves)
        moves.sort(key=_order_key(board), reverse=True)
        scored = []
        best = -INF
        for m in moves:
            alpha = best - jitter - 1 if best > -INF else -INF  # -1: fail-lows land strictly below the candidate band
            board.push(m)
            score = -self.negamax(board, depth - 1, -INF, -alpha if alpha > -INF else INF, 1)
            board.pop()
            scored.append((score, m))
            if score > best:
                best = score
        cands = [m for s, m in scored if s >= best - jitter]
        return best, cands


def build_board(fen: str, history: list[str] | None = None) -> chess.Board:
    """Construct a chess.Board with move history if provided."""
    if history:
        try:
            b = chess.Board()
            for m in history:
                b.push_uci(m)
            if b.fen() == fen or b.board_fen() == chess.Board(fen).board_fen():
                return b
        except Exception:
            pass
        try:
            b = chess.Board(fen)
            for m in history:
                b.push_uci(m)
            return b
        except Exception:
            pass
    return chess.Board(fen)


def choose_move(
    fen: str,
    depth: int = 2,
    jitter: int = 0,
    time_budget: float = TIME_BUDGET,
    history: list[str] | None = None,
):
    """Pick a move for the side to move in `fen`. Returns a dict or None."""
    board = build_board(fen, history)
    if board.is_game_over(claim_draw=False):
        return None
    depth = max(1, min(int(depth), MAX_DEPTH))
    searcher = Searcher(time.monotonic() + time_budget)

    best_score, cands = None, None
    for d in range(1, depth + 1):
        try:
            score, c = searcher.root(board, d, jitter)
        except _Timeout:
            break
        best_score, cands = score, c
        if score >= MATE - 100:  # forced mate found, no need to look deeper
            break

    if not cands:
        cands = list(board.legal_moves)
    if best_score is not None and abs(best_score) >= MATE - 100:
        # never "jitter" away from a forced mate
        pick = cands[0]
    else:
        pick = random.choice(cands)

    return {
        "from": chess.square_name(pick.from_square),
        "to": chess.square_name(pick.to_square),
        "promotion": chess.piece_symbol(pick.promotion) if pick.promotion else "q",
        "score": best_score,
    }
