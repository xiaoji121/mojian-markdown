# Agent Instructions

These rules apply to coding agents working in this repository.

## Before Editing

- Read `docs/CODING_GUIDELINES.md` and inspect the relevant module before making changes.
- Keep existing user changes. Do not revert unrelated edits.
- Prefer the existing DC runtime/component pattern over introducing a new framework layer.

## Development Rules

- Start with a failing or focused test for behavior changes when a test harness exists.
- If no test harness exists, add the smallest useful harness for risky logic; otherwise include explicit manual verification in the final summary.
- Keep files under 800 lines and functions/methods under 140 lines. Aim for functions under 80 lines.
- Split by feature ownership, not by vague buckets like `utils`, unless code is reused by at least two modules.
- Keep `MarkdownEditorLogic.ts` limited to refs, lifecycle wiring, initialization, and template bindings.
- Do not add new inline CSS blocks to `index.html`; use `src/landing.css` or `src/editor/styles.css`.
- Do not add new browser globals unless they are required by the DC runtime bridge.

## Verification

- Run `npm run check` before handing work back.
- For UI changes, start the Vite dev server and verify the page loads locally.
- If a check cannot be run, say exactly why and what risk remains.
