# Wizard's Chess (Gothic Cathedral)

A desktop 3D chess game built with Python, pywebview, and Three.js. Features procedural 3D pieces, custom synth sound effects, atmospheric cathedral environment, and an integrated Python chess engine (negamax with alpha-beta pruning, quiescence search, and piece-square tables).

## Requirements

- Python 3.10+
- Node.js 18+

## Installation

Install Python dependencies:
```bash
pip install -r requirements.txt
```

Install Node.js dependencies (for tests & linting):
```bash
npm install
```

## Running the Game

Launch the desktop application:
```bash
python app.py
```

## Testing & Quality

Run Python tests:
```bash
python -m pytest tests -q
```

Run JavaScript rule tests:
```bash
npm test
```

Run linter:
```bash
npm run lint
```

Run the visual regression test (headless Chromium, serves `web/` over HTTP like the app does):
```bash
npm run test:visual                      # compare against tests/visual_baselines
npm run test:visual -- --baseline        # regenerate baselines after an intentional visual change
CHROMIUM_PATH=/path/to/chrome npm run test:visual   # if Playwright's own browser build is not installed
```
The test opens `index.html?wctest`; the `?wctest` flag exposes test hooks (`window.state`, `handleSquareClick`, ...) that the shipped app does not expose. Baselines allow a 5% pixel difference to absorb GPU/font differences between machines.

## Packaging

Package as a standalone desktop executable with PyInstaller:
```bash
pip install pyinstaller
pyinstaller wizards_chess.spec
```
The built executable will be generated in `dist/wizards_chess.exe` (or `dist/wizards_chess` on Linux/macOS).

To verify the bundle starts cleanly without launching the GUI:
```bash
./dist/wizards_chess.exe --smoke-test
```
