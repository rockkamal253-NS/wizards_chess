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

## Packaging

Package as a standalone desktop executable with PyInstaller:
```bash
pip install pyinstaller
pyinstaller --onefile --windowed --add-data "web;web" --name wizards-chess app.py
```
*(On Linux/macOS, replace `--add-data "web;web"` with `--add-data "web:web"`)*
