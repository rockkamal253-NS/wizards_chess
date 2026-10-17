"""Engine tests. Run: python -m pytest tests -q   (needs: pip install pytest)"""
import sys
from pathlib import Path

import chess
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import engine  # noqa: E402


def mv(fen, depth=2, **kw):
    return engine.choose_move(fen, depth, **kw)


def test_finds_mate_in_one():
    r = mv("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1", 2, jitter=40)
    assert (r["from"], r["to"]) == ("a1", "a8")


def test_never_jitters_away_from_forced_mate():
    for _ in range(10):
        r = mv("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1", 2, jitter=500)
        assert (r["from"], r["to"]) == ("a1", "a8")


def test_takes_free_queen():
    r = mv("4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1", 2)
    assert (r["from"], r["to"]) == ("d1", "d5")


def test_returns_none_when_game_is_over():
    assert mv("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1") is None  # stalemate
    assert mv("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1".replace("R3K3", "R3K3")) is not None


def test_depth_is_clamped():
    r = engine.choose_move(chess.STARTING_FEN, 99, time_budget=1.0)
    assert r is not None


def test_promotion_square_is_reported():
    r = mv("8/P6k/8/8/8/8/8/K7 w - - 0 1", 2)
    assert (r["from"], r["to"]) == ("a7", "a8") and r["promotion"] == "q"


def test_selfplay_is_always_legal():
    b = chess.Board()
    for _ in range(30):
        if b.is_game_over():
            break
        r = mv(b.fen(), 2, jitter=15, time_budget=2.0)
        uci = r["from"] + r["to"]
        if b.piece_type_at(chess.parse_square(r["from"])) == chess.PAWN and r["to"][1] in "18":
            uci += r["promotion"]
        move = chess.Move.from_uci(uci)
        assert move in b.legal_moves
        b.push(move)


def test_evaluate_is_symmetric():
    b = chess.Board()
    assert engine.evaluate(b) == 0 or abs(engine.evaluate(b)) < 50
    # mirrored position from the other side to move must flip sign
    f = chess.Board("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1")
    g = chess.Board("4k3/4p3/8/8/8/8/8/4K3 b - - 0 1")
    assert engine.evaluate(f) == engine.evaluate(g)


def _root_scores(board):
    """Score every legal root move (side-to-move relative) at depth 1, using the real search."""
    import time
    searcher = engine.Searcher(time.monotonic() + 10)
    out = {}
    for m in list(board.legal_moves):
        board.push(m)
        out[m.uci()] = -searcher.negamax(board, 1, -engine.INF, engine.INF, 1)
        board.pop()
    return out


def _play(start_fen, moves):
    b = chess.Board(start_fen) if start_fen else chess.Board()
    for m in moves:
        b.push_uci(m)
    return b


# --- build_board: history is applied only when it provably reproduces the position -----------------

def test_build_board_replays_history_from_standard_start():
    history = ["g1f3", "g8f6", "f3g1", "f6g8"] * 2
    b = _play(None, history)
    board = engine.build_board(b.fen(), history=history)
    assert len(board.move_stack) == len(history)
    assert board.is_repetition(3)


def test_build_board_replays_history_from_custom_start_fen():
    start = "6k1/8/8/8/8/8/8/R5K1 w - - 0 1"
    history = ["a1a2", "g8h8", "a2a1", "h8g8"]
    b = _play(start, history)
    board = engine.build_board(b.fen(), history=history, start_fen=start)
    assert len(board.move_stack) == 4
    assert board.is_repetition(2)


def test_build_board_without_start_fen_ignores_history_that_does_not_fit():
    # History belongs to a game imported from a FEN; without start_fen it cannot be replayed from the
    # standard start. It must be ignored (position unchanged), never applied to the wrong board.
    start = "6k1/8/8/8/8/8/8/R5K1 w - - 0 1"
    history = ["a1a2", "g8h8", "a2a1"]
    fen = _play(start, history).fen()
    board = engine.build_board(fen, history=history)
    assert board.epd() == chess.Board(fen).epd()
    assert len(board.move_stack) == 0


def test_build_board_ignores_illegal_or_inconsistent_history():
    fen = chess.Board().fen()
    for bad in (["e2e5"], ["e2e4"], ["zzzz"], []):
        board = engine.build_board(fen, history=bad)
        assert board.epd() == chess.Board(fen).epd()
        assert len(board.move_stack) == 0


# --- the search actually uses it (each assertion fails if the history were dropped) ----------------

def test_repeating_move_is_scored_as_a_draw_only_when_history_is_known():
    start = "6k1/8/8/8/8/8/8/R5K1 w - - 0 1"
    history = ["a1a2", "g8h8", "a2a1", "h8g8"]
    fen = _play(start, history).fen()
    with_history = _root_scores(engine.build_board(fen, history, start))
    without = _root_scores(chess.Board(fen))
    assert with_history["a1a2"] == 0          # repeats a position -> draw
    assert without["a1a2"] > 300              # no history -> looks like a winning rook move
    assert max(v for k, v in with_history.items() if k != "a1a2") > 300


def test_engine_claims_repetition_when_losing():
    # Black is down a queen (about -895 everywhere) but Kh8-g8 repeats a position (0). With history the
    # engine must always take the draw; without it, it has no reason to prefer that move.
    start = "7k/8/8/8/8/8/8/K2Q4 b - - 0 1"
    history = ["h8g8", "d1d2", "g8h8", "d2d1"]
    fen = _play(start, history).fen()
    for _ in range(8):
        r = engine.choose_move(fen, 2, history=history, start_fen=start)
        assert (r["from"], r["to"]) == ("h8", "g8")
    scores = _root_scores(chess.Board(fen))
    assert scores["h8g8"] < -300               # confirms the draw is only visible through history


def test_choose_move_survives_bad_history():
    r = engine.choose_move(chess.STARTING_FEN, 1, history=["e2e5", "garbage"], start_fen="not a fen")
    assert r is not None
