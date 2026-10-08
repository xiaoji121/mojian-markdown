# Unsigned TEST installers

This is a test pipeline, not a release. It creates Windows x64 NSIS `.exe`,
macOS arm64 DMG and macOS x64 DMG using separate native standard runners.
The workflow runs on pull requests and can be dispatched manually after merge.
No release, tag, auto-updater, signing account, signing secrets, notarization or
live AI credentials are used. `--publish never` and read-only workflow permissions
are explicit. Existing Ubuntu and Windows desktop checks remain unchanged.

## Isolation and artifacts

- TEST app ID `com.yuxizhai.mojian-markdown.test`; display/executable name
  `Mojian Markdown TEST`. No file associations or automatic first launch.
- Versions `1.0.0-test.<run>.1` and Windows upgrade candidate `.2`. These versions
  are only packaging metadata; the checked-in project version is unchanged.
- Artifacts are named by version, platform and architecture, expire after seven
  days, and include SHA-256 checksums, exact source commit and scope disclosure.
  They are uploaded only after installer smoke passes. Artifacts in this public
  repository are publicly accessible. Do not put personal material into builds.
- A clean checkout and explicit package allowlist include app JavaScript, compiled
  index/assets, bridge runtime dependencies, the project LICENSE, complete license
  and notice texts for installed production packages and Electron, and Chromium's
  notice file. The actual ASAR is audited before smoke.
- Public uploads, font source files, optional Canger fonts, development workspaces,
  dotenv files and repository metadata are excluded. No font-fetch step or font
  cache is used. KaTeX's bundled fonts retain their dependency license notices.
- The project remains PolyForm Noncommercial 1.0.0. This pipeline does not change
  its license or authorize commercial distribution. The default Electron test
  icon is used; no unlicensed icon assets are downloaded.

## Automated smoke and limits

Windows installs per-user into a temporary path, launches the installed app,
checks synthetic editing/persistence and restart, installs the newer `.2` build,
checks retained synthetic data and uninstalls. The test must retain the synthetic
userData and document after uninstall. No real documents or accounts are used.

macOS mounts each architecture's DMG read-only, copies the application to a
runner-temporary directory, detaches the image, then checks launch, synthetic
editing/persistence and restart. It does not install into `/Applications`.

These tests use hosted Windows Server and macOS 15 runners. They do not establish
Windows 10/11 physical-device behavior, SmartScreen reputation, a GUI wizard's
manual interaction, downloaded-file quarantine/Gatekeeper approval, notarization,
real Keychain/DPAPI migration, production upgrades or live AI authentication.
macOS test bundles use a local ad-hoc signature (no identity or account) with
Electron JIT/library-loading entitlements; they are not Developer ID signed or
notarized. This changes only the test bundle, never OS security settings. Treat OS warnings seriously; this workflow does
not disable Gatekeeper, SmartScreen, antivirus or browser security warnings.

Before public distribution, separately approve signing/notarization, validate on
physical target systems, review licensing/branding and perform an explicitly
approved release. Nothing here publishes a GitHub Release.

## Runner references

Verified against the official [GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners):
`windows-2025` x64, `macos-15` arm64, `macos-15-intel` x64. The workflow fails if
`process.arch` disagrees, rather than silently testing under emulation.
NSIS behavior follows the [electron-builder NSIS documentation](https://www.electron.build/docs/nsis/).
