// Isolated, unsigned TEST distribution. Never use this identity for production.
module.exports = {
  directories: { output: 'release' },
  npmRebuild: false,
  appId: 'com.yuxizhai.mojian-markdown.test',
  productName: 'Mojian Markdown TEST',
  extraMetadata: { name: 'mojian-markdown-test', productName: 'Mojian Markdown TEST' },
  executableName: 'Mojian Markdown TEST',
  artifactName: 'Mojian-Markdown-${version}-TEST-${os}-${arch}.${ext}',
  publish: null,
  fileAssociations: [],
  files: [
    'desktop/*.js', 'desktop/preload.cjs', 'dist/index.html', 'dist/assets/**',
    'dist/THIRD_PARTY_NOTICES.txt', 'scripts/agent-bridge*.js', 'LICENSE', 'package.json'
  ],
  extraResources: [{ from: 'node_modules/electron/dist/LICENSES.chromium.html', to: 'licenses/LICENSES.chromium.html' }],
  win: { target: [{ target: 'nsis', arch: ['x64'] }], signAndEditExecutable: false },
  nsis: {
    oneClick: false, perMachine: false, allowElevation: false,
    allowToChangeInstallationDirectory: true, runAfterFinish: false,
    createDesktopShortcut: false, createStartMenuShortcut: false,
    deleteAppDataOnUninstall: false
  },
  mac: {
    category: 'public.app-category.productivity', identity: '-', notarize: false,
    entitlements: 'desktop/test-entitlements.plist', entitlementsInherit: 'desktop/test-entitlements.plist',
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }]
  },
  dmg: { sign: false }
};
