# Code signing & notarization (N-E)

**工程师已就绪 / 等待用户证书（Engineering ready / waiting for user certificates）。**

This document separates what the repository already wires up from what only
the account holder (you) can buy, enroll, and store as CI secrets.
**Never commit** certificates, private keys, or API tokens to git.

| Side | Status |
| --- | --- |
| Engineer | Config skeleton, entitlements, release builder, manual CI workflow, landing honesty copy |
| User | Apple Developer + Developer ID cert, notarization API key, Windows signing (Azure Trusted Signing or OV `.pfx`), GitHub Actions secrets, fees |
| Not done | Actual signed/notarized public release; SmartScreen reputation; auto-update |

Related: [TEST installers](./TEST_INSTALLERS.md) (unsigned TEST only),
[Desktop roadmap](./DESKTOP_ROADMAP.md) §1.2.

## What engineers already prepared

- `desktop/electron-builder.yml` — default packaging; Hardened Runtime +
  entitlements reserved; **does not** force notarize (unsigned local builds OK).
- `desktop/electron-builder.release.cjs` — signed release path with
  `forceCodeSigning: true` and `mac.notarize: true`. Fails closed without creds.
- `desktop/entitlements.mac.plist` — production Electron JIT entitlements.
- `desktop/electron-builder.test.cjs` — unchanged isolated **TEST** identity
  (`identity: '-'`, no notarize, Windows `signAndEditExecutable: false`).
- `.github/workflows/signed-release.yml` — **workflow_dispatch only**; checks
  secrets then builds. Never runs on PR/push. Does not publish a GitHub Release.
- Landing page copy marks **TEST / unsigned** and points here.
- Scripts: `npm run build:desktop` (default yml), `npm run build:desktop:release`
  (release config; needs env).

## What you (user) still need to do

### 1. macOS — Apple Developer + notarization

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/)
   (~USD 99 / year).
2. Create a **Developer ID Application** certificate; export as `.p12`.
3. Create an App Store Connect **API key** (Developer role) for `notarytool`;
   download the `.p8` once.
4. Note **Team ID**, **Issuer ID**, and **Key ID**.

Suggested GitHub Actions secrets:

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64 of the `.p12` (`base64 -i cert.p12`) |
| `CSC_KEY_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_API_KEY` | Base64 of the `.p8` key file |
| `APPLE_API_KEY_ID` | Key ID |
| `APPLE_API_ISSUER` | Issuer UUID |
| `APPLE_TEAM_ID` | 10-character Team ID |

Alternative to API key (less ideal for CI): `APPLE_ID` +
`APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`. Prefer the API key path.

### 2. Windows — choose one signing path

**Preferred (CI-friendly):** [Azure Trusted Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/)
(~USD 10 / month tier; pricing subject to Microsoft). After the account exists,
wire `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` and set
`win.azureSignOptions` (electron-builder v26) or `win.sign: { type: "azure", ... }`
in `electron-builder.release.cjs`. Do **not** commit account names as live config
until the subscription is real — placeholders would break builds.

**Alternative:** Traditional OV (or EV) Authenticode certificate as `.pfx`:

| Secret | Value |
| --- | --- |
| `WIN_CSC_LINK` | Base64 of the `.pfx` |
| `WIN_CSC_KEY_PASSWORD` | PFX password |

OV/EV trust still needs SmartScreen reputation over time; signing removes the
"unknown publisher" worst case but does not guarantee zero warnings on day one.

### 3. After secrets exist

1. Open Actions → **Signed release (skeleton)** → Run workflow.
2. Set `confirm` to `SIGN`, choose platform.
3. Download artifacts; verify Gatekeeper (macOS) / SmartScreen (Windows) on a
   clean machine before any public download page switch.
4. Only then change landing copy from TEST/unsigned to “signed release”, and
   only after an explicit product decision.

## Honesty rules for download / landing pages

Until a signed build is verified and approved for public distribution:

- Say **TEST** or **unsigned / not formally signed**.
- Do not imply Gatekeeper or SmartScreen approval.
- Point to `docs/TEST_INSTALLERS.md` for TEST artifacts and this file for the
  certificate wait state.
- CI smoke on hosted runners ≠ physical-device install acceptance.

## Commands (local)

```bash
# Unsigned / default (no certs required)
npm run build:desktop

# Signed release (fails without env secrets)
CSC_LINK=... CSC_KEY_PASSWORD=... \
APPLE_API_KEY=... APPLE_API_KEY_ID=... APPLE_API_ISSUER=... APPLE_TEAM_ID=... \
npm run build:desktop:release -- --mac

WIN_CSC_LINK=... WIN_CSC_KEY_PASSWORD=... \
npm run build:desktop:release -- --win
```

## Risk notes

- Shipping an unsigned installer as a “正式版” will confuse users and trip OS
  blocks; keep TEST and release identities separate.
- Never put `.p12` / `.pfx` / `.p8` or passwords in the repo, PR comments, or
  landing HTML.
- Mac App Store is out of scope (sandbox blocks spawning external AI CLIs);
  direct distribution + Developer ID remains the plan.
- This skeleton does **not** enable auto-update; that still depends on signed
  releases (roadmap §2.3).
