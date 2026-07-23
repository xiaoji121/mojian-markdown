# Agent Instructions

These rules apply to coding agents working in this repository.

## Before Editing

- Read `docs/CODING_GUIDELINES.md` and inspect the relevant module before making changes.
- Keep existing user changes. Do not revert unrelated edits.
- Prefer the existing DC runtime/component pattern over introducing a new framework layer.

## Development Rules

- A two-layer test harness exists (see `docs/TESTING.md`): `node:test` unit tests in `tests/unit/` and Playwright E2E in `tests/e2e/`. For any behavior change, write the failing test FIRST, watch it fail, then implement.
- Module-level logic goes in a unit test (use the stubs in `tests/helpers/dom.ts`). User-visible flows (editing, preview, layout, persistence) get an E2E spec via `tests/e2e/fixtures.ts` helpers.
- Keep files under 800 lines and functions/methods under 140 lines. Aim for functions under 80 lines.
- Split by feature ownership, not by vague buckets like `utils`, unless code is reused by at least two modules.
- Keep `MarkdownEditorLogic.ts` limited to refs, lifecycle wiring, initialization, and template bindings.
- Do not add new inline CSS blocks to `index.html`; use `src/landing.css` or `src/editor/styles.css`.
- Do not add new browser globals unless they are required by the DC runtime bridge.

## Verification

- Run `npm run check` before handing work back.
- For changes to user-visible behavior, also run `npm run test:e2e` (or `npm run check:full`). First run needs `npx playwright install chromium`.
- For UI changes, start the Vite dev server and verify the page loads locally.
- If a check cannot be run, say exactly why and what risk remains.
