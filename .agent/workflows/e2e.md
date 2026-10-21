---
description: Open the app in a browser tab and run the full player-level test flow
---

1. Read `docs/TEST_FLOW.md`.
2. If `tests/e2e_flow.mjs` does not exist yet, build it per the Deliverables section, then continue.
3. Automated: `npm run test:e2e`. Visible run: `npm run test:e2e -- --headed --slowmo=300`.
4. Manual, if you drive your own browser tab: `npm run serve`, open `http://127.0.0.1:8080/index.html?wctest`, and walk scenarios 1 to 16. Then open the URL without `?wctest` and confirm scenario 2.
5. Save screenshots and the report in `tests/e2e_output/` (git-ignored).
6. Run the mutation check from the Acceptance section when you change the e2e script itself.
7. On a machine with a display: `npm run test:e2e -- --headed --python --real-app`, and record the result in `docs/PROGRESS.md` under "Verified on real hardware".
