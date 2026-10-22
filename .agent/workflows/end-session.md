---
description: Save state so the next session loses nothing
---

1. Run `/test-all`. Do not commit on red.
2. Update `docs/PROGRESS.md`: move finished items to "Done", set "In progress", reorder "Next up", add new "Decisions" and "Gotchas", fill "Last known good commit" and the last test run line, and add the session-log line.
3. If behaviour or structure changed, update `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md` or `docs/API_CONTRACT.md` and anything in `AGENTS.md` that is now wrong.
4. Commit and push the task branch (`git push -u origin task/<short-name>`). Never push `main`.
5. Stop. Do not start the next task in the same session unless asked.
