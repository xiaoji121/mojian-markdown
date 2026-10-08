# Interface localization

The editor language selector supports Simplified Chinese (`zh-CN`), Traditional Chinese (`zh-TW`), English (`en`), and Japanese (`ja`). Changes take effect without reloading the document.

## Preferences and boundaries

- The saved language wins over the browser/system language. Chinese traditional scripts/regions use `zh-TW`; other Chinese locales use `zh-CN`; Japanese uses `ja`; unsupported languages fall back to English.
- Web preferences use the existing editor localStorage record. Desktop preferences use the existing validated, atomic `userData/editor-state.json`, independent of the bridge's random port. A failed save is reported rather than silently claiming persistence.
- Desktop menus follow the saved language after a successful trusted state save. Operating-system file picker chrome remains controlled by the OS; application titles, menu labels and error wrappers use the app language.
- Authored editor menus, tooltips, accessibility labels, settings, readiness, dialogs, status and errors use explicit source-key dictionaries in `src/editor/locales/`. Interpolation values remain unchanged.
- Document text, filenames, selections, annotations, generated answers, prompts, and technical error details are not automatically translated. This also applies to raw document HTML containing attributes named `data-i18n`. Only registered application controls inside content can be localized.
- The public landing page and browser clipper popup/reader are not localized in this change. Their Chinese editorial content is retained. The initial sample Markdown is document content and also remains Chinese.

## Local reading font

The reader prefers an already-installed Tsanger JinKai 04 font and falls back to system fonts. Appearance settings report whether the local face was detected and link to the official license/install page. Local FontFace loading makes no network request and does not enumerate fonts, install software, or ask for additional browser permissions. Failure to detect a font does not prove it is not installed; browser privacy restrictions can also prevent detection.

Application startup and CI do not download the restricted font. Build/package guards exclude known generated Canger payloads while retaining KaTeX and other unrelated assets. Manual developer font tooling is retained separately; using it does not authorize distribution.

## Verification

- `npm run check`: size, TypeScript, unit tests, web and extension builds.
- `tests/unit/i18n.test.ts`: locale detection, dictionary completeness/interpolation, content-boundary protection and image-limit errors.
- `tests/unit/aiLocale.test.ts`, `featureMessages.test.ts`, `desktopLocale.test.ts`: dynamic labels, safe settings refresh, native menus, trusted save/persistence and packaging.
- `tests/e2e/interfaceLocale.spec.ts`: all four languages, immediate switching, reload persistence, raw document preservation, layout screenshots and first-launch detection.
- `tests/desktop/locale.spec.ts`: real selector changes, four durable restarts, native menus and screenshots using isolated homes/profiles and no provider credentials.
- **Interface locales** CI runs the desktop scenario on Linux and Windows, and web locale screenshots on Linux. These are tests, not builds approved for distribution.

Local verification may be limited by execution sandboxes that forbid Chromium/Electron process sockets. In that case, browser/native checks remain pending until their CI jobs pass; successful unit tests are not a substitute for screenshots or restart tests.
