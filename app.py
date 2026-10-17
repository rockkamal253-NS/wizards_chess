"""Wizard's Chess — Gothic Cathedral (desktop edition).

Run:  pip install -r requirements.txt && python app.py
The UI lives in web/ (index.html, style.css, ES modules starting at main.js, vendor/). Nothing is written to disk at runtime.
"""
import sys
from pathlib import Path

import webview

from engine import choose_move

# Works from source and from a PyInstaller bundle (add --add-data "web;web").
BASE_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
INDEX = BASE_DIR / "web" / "index.html"

# Per-level move randomisation in centipawns (Novice plays looser, Master is sharp).
JITTER = {1: 40, 2: 15, 3: 5}


class NativeChessBridge:
    def __init__(self):
        self._window = None

    def compute_ai_move(self, fen: str, depth: int = 2, history: list[str] | None = None,
                        start_fen: str | None = None):
        try:
            depth = int(depth)
            return choose_move(fen, depth, jitter=JITTER.get(depth, 10), history=history, start_fen=start_fen)
        except Exception as exc:  # bad FEN etc. -> JS falls back to a random legal move
            print("compute_ai_move failed:", exc, file=sys.stderr)
            return None

    def compute_hint(self, fen: str, history: list[str] | None = None, start_fen: str | None = None):
        try:
            return choose_move(fen, 2, jitter=0, time_budget=3.0, history=history, start_fen=start_fen)
        except Exception as exc:
            print("compute_hint failed:", exc, file=sys.stderr)
            return None

    def toggle_fullscreen(self):
        if self._window:
            self._window.toggle_fullscreen()
        return True


def main():
    if "--smoke-test" in sys.argv:
        meipass = getattr(sys, "_MEIPASS", None)
        print(f"SMOKE_TEST: meipass={meipass}, INDEX={INDEX}, exists={INDEX.exists()}")
        sys.exit(0 if INDEX.exists() else 1)

    if not INDEX.exists():
        sys.exit(f"Missing UI file: {INDEX}")
    bridge = NativeChessBridge()
    win = webview.create_window(
        title="Wizard's Chess — Gothic Cathedral",
        url=str(INDEX),
        js_api=bridge,
        width=1600,
        height=940,
        min_size=(1100, 700),
        background_color="#07060B",
    )
    bridge._window = win
    webview.start(http_server=True)


if __name__ == "__main__":
    main()
