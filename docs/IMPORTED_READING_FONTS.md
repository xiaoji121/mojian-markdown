# Reading fonts from local files

Desktop global settings can import one WOFF, WOFF2, TTF or OTF file (up to 32 MiB). Choose a file you have the right to use. The application checks the container, asks Chromium to decode it, then stores an exact app-local copy. It never uploads the font or installs it system-wide. Importing a replacement keeps the previous copy until validation and an atomic save succeed. Removing the imported copy does not change the original file.

The displayed label is the selected filename, not a claim about the font’s family, variant or license. “Imported font” is distinct from the OS-local JinKai W04 choice. The official-foundry link opens its product/download page in your browser; the app does not automatically download from that page or a CDN.

For `npm run desktop`, the separate “Project font (font:fetch)” choice can read an **existing** `public/fonts/canger-jinkai-04/cejk-subset.woff2`. This does not rerun the fetch/subset commands and does not identify that WeRead-sourced file as the OS-installed W04 face. Packaged apps cannot read project files. To use the same acquired file in an installed app, explicitly select it with Import font, subject to its license.

Saved font choices are not migrated or silently changed. A missing project/imported face falls back safely and reports its unavailable source. Corrupt imported records fail closed and are preserved for recovery rather than silently overwritten. Public builds and installers retain their restricted-font exclusions; importing a user-selected font is not a redistribution license.

Tests use synthetic headers and the project’s unmodified OFL Source Serif fixture. They check exact bytes, actual glyph pixels, cancellation, malformed files, atomic failure handling, native restart and export-cache replacement. They do not establish the availability, variant or license of any user’s JinKai file.
