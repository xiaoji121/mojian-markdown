# Coding Guidelines

This project keeps editor behavior grouped by feature. New code should go into the smallest module that owns the behavior instead of expanding the main controller or `index.html`.

## Module Boundaries

- `src/editor/MarkdownEditorLogic.ts`: component factory, refs, lifecycle wiring, and template bindings only.
- `src/editor/viewMethods.ts`: preview rendering, outline, view mode, theme, font, status, and editor counts.
- `src/editor/bridgeMethods.ts`: Reading Workspace / Agent Bridge document list and persistence sync.
- `src/editor/navigationMethods.ts`: source-preview anchoring, scrolling, and highlight flash behavior.
- `src/editor/commentMethods.ts`: selection toolbar, annotations, comment panel rendering, and copy helpers.
- `src/editor/aiMethods.ts`: AI panel, AI history, chat streaming, AI message rendering, and per-request project-tool confirmation.
- `src/editor/connectorMethods.ts`: publishing the current document to Feishu / DingTalk through the bridge (`/api/publish`) and reporting the returned link.
- `src/editor/longImageMethods.ts`: the "save as long image" modal, poster composition, and SVG/canvas rasterization. `src/editor/longImageComposer.ts`: its pure logic (width presets, scale/tile planning, CSS extraction) — keep new logic testable there rather than in the DOM-facing module.
- `src/editor/editingFileLayoutMethods.ts`: Markdown formatting commands, local file operations, and resizable layout handles.
- `src/editor/localFileSyncMethods.ts`: bidirectional sync with the opened local file (write-through autosave, external-change watcher, conflict handling). `src/editor/fileHandleStore.ts`: IndexedDB persistence of file/folder handles (folder handles power the "文件夹名/相对路径" display).
- `src/editor/styles.css`: editor UI CSS. `src/landing.css`: landing-page CSS. `src/editor/shell.css`: editor shell layout; `src/editor/aiPanel.css`: AI panel only (split out of `shell.css` when it neared the 800-line cap — must load after it).
- `scripts/agent-bridge.js`: bridge routing and SSE only. Feature logic lives beside it: `agent-bridge-agent.js` (Agent mode: project context, prompt, session resume/recovery), `agent-bridge-connectors.js` (Feishu/DingTalk CLI publishing), `agent-bridge-project.js` (`localPath` → project root), `agent-bridge-engines.js` (CLI/API engine invocation), `agent-bridge-store.js`, `agent-bridge-settings.js`.

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
