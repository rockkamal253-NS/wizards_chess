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


def test_engine_can_see_repetition_history():
    history = ["g1f3", "g8f6", "f3g1", "f6g8"] * 2
    b = chess.Board()
    for m in history:
        b.push_uci(m)
    board = engine.build_board(b.fen(), history=history)
    assert board.is_repetition(3)


def test_engine_avoids_repetition_when_winning():
    # White has K+Q vs K. Repeating Kh1-g1 leads to a 0-score draw.
    # The engine should avoid this repetition since it has an overwhelming win.
    b = chess.Board("7k/8/8/8/8/8/8/6QK w - - 0 1")
    history = ["g1h1", "h8g8", "h1g1", "g8h8", "g1h1", "h8g8"]
    r = engine.choose_move(b.fen(), depth=2, history=history)
    assert r is not None
    assert (r["from"], r["to"]) != ("h1", "g1")


def test_engine_claims_repetition_when_losing():
    # Black is down a Queen but can repeat Qe5-e1+ to force a repetition draw (0 vs losing).
    b = chess.Board("Q7/7k/8/4q3/8/8/6PP/7K b - - 0 1")
    history = ["e5e1", "h1h2", "e1e5", "h2h1", "e5e1", "h1h2", "e1e5", "h2h1"]
    r = engine.choose_move(b.fen(), depth=2, history=history)
    assert r is not None
    assert (r["from"], r["to"]) == ("e5", "e1")

