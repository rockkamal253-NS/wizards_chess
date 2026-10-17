import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


def test_spec_file_contains_web_assets():
    spec = ROOT / "wizards_chess.spec"
    assert spec.exists(), "wizards_chess.spec must exist"
    content = spec.read_text(encoding="utf-8")
    assert "('web', 'web')" in content or "('web', 'web')" in content.replace('"', "'")


def test_app_source_smoke_test():
    proc = subprocess.run(
        [sys.executable, str(ROOT / "app.py"), "--smoke-test"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    assert "exists=True" in proc.stdout


def test_built_binary_smoke_test():
    exe_name = "wizards_chess.exe" if sys.platform == "win32" else "wizards_chess"
    exe_path = ROOT / "dist" / exe_name
    if not exe_path.exists():
        pytest.skip("no PyInstaller build in dist/ (run: pyinstaller wizards_chess.spec)")

    proc = subprocess.run(
        [str(exe_path), "--smoke-test"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    assert proc.returncode == 0
    assert "exists=True" in proc.stdout
    assert "meipass=" in proc.stdout
