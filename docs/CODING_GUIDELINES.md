# Coding Guidelines

This project keeps editor behavior grouped by feature. New code should go into the smallest module that owns the behavior instead of expanding the main controller or `index.html`.

## Module Boundaries

- `src/editor/MarkdownEditorLogic.ts`: component factory, refs, lifecycle wiring, and template bindings only.
- `src/editor/viewMethods.ts`: preview rendering, outline, view mode, theme, font, status, and editor counts.
- `src/editor/bridgeMethods.ts`: Reading Workspace / Agent Bridge document list and persistence sync.
- `src/editor/navigationMethods.ts`: source-preview anchoring, scrolling, and highlight flash behavior.
- `src/editor/commentMethods.ts`: selection toolbar, annotations, comment panel rendering, and copy helpers.
- `src/editor/aiMethods.ts`: AI panel, AI history, chat streaming, and AI message rendering.
- `src/editor/editingFileLayoutMethods.ts`: Markdown formatting commands, local file operations, and resizable layout handles.
- `src/editor/styles.css`: editor UI CSS. `src/landing.css`: landing-page CSS.

## Rules For New Work

- Keep files under 800 lines. If a change would push a file past that, split by feature before merging.
- Keep functions and methods under 140 lines. Treat 80 lines as the normal target; split earlier when a function mixes UI creation, data fetching, parsing, and state mutation.
- Prefer feature-local modules over generic utility modules until behavior is reused in at least two places.
- Keep DOM-manipulation helpers near the feature that owns the DOM they mutate.
- Keep `MarkdownEditorLogic.ts` as orchestration only; avoid adding business logic there.
- For behavior changes, write the failing test first — see `docs/TESTING.md` for the two-layer harness (unit tests in `tests/unit/`, Playwright E2E in `tests/e2e/`) and templates.
- Run `npm run check` before committing; add `npm run test:e2e` (or `npm run check:full`) when user-visible behavior changed.

## Community Baseline

The structure follows the React guidance that projects commonly group related JS, CSS, and tests by feature or route, while TypeScript/Vite checks remain part of the normal build loop. If linting is added later, prefer ESLint flat config with `typescript-eslint` recommended rules.
