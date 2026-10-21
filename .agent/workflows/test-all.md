---
description: Run every automated test and report one pass/fail table
---

1. `npm run test:all`. This runs lint, JS unit tests, visual regression, the browser e2e flow and pytest.
2. If a step fails, open its output, fix the cause (not the test), and rerun only that step first, then the whole command.
3. Visual diffs: look at the diff image in the test output before regenerating baselines. Regenerate only for an intended visual change, and say so in the commit message.
4. Report a table: layer, command, result, counts. Paste it into the session log in `docs/PROGRESS.md`.
5. Bug fixed in this session? Confirm a regression test exists for it, and that it fails when the fix is reverted.
