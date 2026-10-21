---
description: Load project memory and confirm a green baseline before any work
---

1. Read `AGENTS.md` and `docs/PROGRESS.md`. Note the first item under "Next up" and everything under "Gotchas".
2. `git status` and `git log --oneline -5`. If the tree is dirty with changes you did not make, stop and report.
3. Install if needed: `pip install -r requirements.txt` and `npm install`.
4. Run the baseline: `npm run lint`, `npm test`, `python -m pytest tests -q`, `npm run test:visual`. If `tests/e2e_flow.mjs` exists, also `npm run test:e2e`.
5. If anything fails on a clean tree, fix or report that first; do not start the task on a red baseline.
6. Write one line to the session log in `docs/PROGRESS.md` stating the task you are taking, and move it to "In progress".
