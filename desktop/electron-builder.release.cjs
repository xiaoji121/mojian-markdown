// Signed production release packaging. Requires certificates via env / CI secrets.
// Never commit certificates, passwords, or API keys.
// Without credentials, forceCodeSigning fails the build (intentional).
// Default unsigned / local builds keep using desktop/electron-builder.yml.
// TEST installers keep using desktop/electron-builder.test.cjs (isolated identity).
//
// Activate with: npm run build:desktop:release
// Docs: docs/SIGNING.md
module.exports = {
  directories: { output: 'release' },
  npmRebuild: false,
  forceCodeSigning: true,
  appId: 'com.yuxizhai.mojian-markdown',
  productName: '墨笺 Markdown',
  artifactName: 'Mojian-Markdown-${version}-${os}-${arch}.${ext}',
  publish: null,
  files: [
    'desktop/**',
    'dist/**',
    '!**/canger*/**',
    '!**/cejk*',
    '!**/tsanger*/**',
    'scripts/agent-bridge*.js',
    'package.json',
  ],
  fileAssociations: [
    { ext: 'md', name: 'Markdown', role: 'Editor' },
    { ext: 'markdown', name: 'Markdown', role: 'Editor' },
  ],
  mac: {
    category: 'public.app-category.productivity',
    hardenedRuntime: true,
    entitlements: 'desktop/entitlements.mac.plist',
    entitlementsInherit: 'desktop/entitlements.mac.plist',
    gatekeeperAssess: false,
    notarize: true,
    // identity via CSC_LINK / CSC_NAME; do not hard-code Team ID here.
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }],
  },
  dmg: {
    // DMG is signed when a Developer ID identity is available.
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    // Prefer Azure Trusted Signing once the user account exists:
    //   win.azureSignOptions (electron-builder v26) or win.sign: { type: 'azure', ... }
    // Until then, set WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD (OV .pfx).
    // Do not enable azureSignOptions with placeholder account names — that would break builds.
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
};
