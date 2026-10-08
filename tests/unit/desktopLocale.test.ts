import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { canonicalDesktopLocale, initialDesktopLocale, nativeText, nativeMenuTemplate } from '../../desktop/locale.js';
import { sanitizeEditorState, createEditorStateStore } from '../../desktop/editorState.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, matchesGlob } from 'node:path';

test('desktop detects canonical platform locales and respects saved choices', () => {
  for (const [input, expected] of Object.entries({ 'zh-Hant': 'zh-TW', 'zh-HK': 'zh-TW',
    'zh-TW': 'zh-TW', 'zh-Hant-HK': 'zh-TW', 'zh-CN': 'zh-CN', zh: 'zh-CN',
    'ja-JP': 'ja', 'en-GB': 'en', 'fr-FR': 'en', 'ZH_hant': 'zh-TW' })) {
    assert.equal(canonicalDesktopLocale(input), expected);
  }
  assert.equal(initialDesktopLocale({ locale: 'ja' }, 'zh-CN'), 'ja');
  assert.equal(initialDesktopLocale(null, 'zh-HK'), 'zh-TW');
  assert.equal(initialDesktopLocale({ locale: 'bad' }, 'en-US'), 'en');
});

test('editor state stores only canonical locale choices, preserving legacy records', () => {
  for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja']) {
    assert.equal(sanitizeEditorState({ content: '# draft', locale }).locale, locale);
  }
  assert.deepEqual(sanitizeEditorState({ content: '# old' }), { content: '# old' });
  assert.throws(() => sanitizeEditorState({ content: '# draft', locale: 'fr' }), /locale/);
});

test('native menus localize all role labels and preserve actions and accelerators', () => {
  const labels = { 'zh-CN': '文件', 'zh-TW': '檔案', en: 'File', ja: 'ファイル' };
  for (const [locale, label] of Object.entries(labels)) {
    const actions: string[] = [];
    const menu = nativeMenuTemplate(locale, false, (action: string) => actions.push(action));
    assert.equal(menu[0].label, label);
    assert.equal(menu[0].submenu[0].accelerator, 'CmdOrCtrl+N');
    menu[0].submenu[0].click();
    assert.deepEqual(actions, ['new']);
    const visit = (items: any[]) => items.forEach(item => {
      if (item.type !== 'separator') assert.equal(typeof item.label, 'string');
      if (item.submenu) visit(item.submenu);
    });
    visit(nativeMenuTemplate(locale, true, () => {}));
    visit(menu);
    assert.equal(nativeText(locale, 'ungrantedPath', { detail: '/tmp/測試.md' }).includes('/tmp/測試.md'), true);
  }
});

test('draft read failures use the current locale and preserve technical details and damaged bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'mojian-locale-'));
  try {
    writeFileSync(join(root, 'editor-state.json'), '{broken');
    let locale = 'en';
    const store = createEditorStateStore(root, undefined, () => locale);
    assert.match(store.load().error, /Unable to read the desktop draft/);
    locale = 'ja';
    assert.match(store.load().error, /デスクトップの下書き/);
    assert.equal(store.save({ content: '# draft', locale: 'en' }).ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('test desktop package includes the native locale module', () => {
  const require = createRequire(import.meta.url);
  const config = require('../../desktop/electron-builder.test.cjs');
  assert.ok(config.files.some((pattern: string) => matchesGlob('desktop/locale.js', pattern)));
});

for (const eol of ['\n', '\r\n'])
test('native IPC accepts ' + JSON.stringify(eol) + ' sources and only trusts successful saves', async () => {
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const { isTrustedEditorSender } = await import('../../desktop/editorState.js');
  const handlers = new Map();
  const menus: any[] = [];
  const frame = { url: 'http://127.0.0.1:4321/#editor' };
  const contents = { mainFrame: frame };
  let saved = 0;
  let saveSucceeds = true;
  const source = readFileSync(new URL('../../desktop/main.js', import.meta.url), 'utf8')
    .replace(/\r?\n/g, eol)
    .replace(/^import .*;\r?\n/gm, '')
    .replace('dirname(fileURLToPath(import.meta.url))', "'/test/desktop'");
  runInNewContext(source + `\nmainWindow = testWindow; bridge = { url: 'http://127.0.0.1:4321' };
    editorStateStore = testStore; registerEditorStateIpc();`, {
    app: { requestSingleInstanceLock: () => false, quit: () => {}, setPath: () => {} },
    process: { env: {}, platform: 'linux' }, randomBytes: () => ({ toString: () => 'test-capability' }),
    ipcMain: { on: (name: string, handler: any) => handlers.set(name, handler) },
    Menu: { buildFromTemplate: (template: any) => template, setApplicationMenu: (menu: any) => menus.push(menu) },
    desktopLocales: ['zh-CN', 'zh-TW', 'en', 'ja'], nativeText, nativeMenuTemplate, isTrustedEditorSender,
    testWindow: { webContents: contents },
    testStore: { save: () => { saved++; return { ok: saveSucceeds }; } }
  });
  const save = handlers.get('desktop:save-editor-state');
  const trusted: any = { sender: contents, senderFrame: frame };
  save(trusted, { content: '# draft', locale: 'ja' });
  assert.equal(trusted.returnValue.ok, true);
  assert.equal(menus.at(-1)[0].label, 'ファイル');
  const untrusted: any = { sender: {}, senderFrame: frame };
  save(untrusted, { content: '# injected', locale: 'en' });
  assert.equal(untrusted.returnValue.ok, false);
  assert.equal(saved, 1);
  assert.equal(menus.length, 1);
  saveSucceeds = false;
  save(trusted, { content: '# draft', locale: 'zh-CN' });
  assert.equal(menus.length, 1);
  saveSucceeds = true;
  save(trusted, { content: '# legacy draft' });
  assert.equal(menus.length, 1);
  save(trusted, { content: '# draft', locale: 'zh-TW' });
  assert.equal(menus.at(-1)[0].label, '檔案');
});


test('saved locale survives reopening the store and overrides another platform language', () => {
  const root = mkdtempSync(join(tmpdir(), 'mojian-locale-'));
  try {
    for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja']) {
      assert.equal(createEditorStateStore(root).save({ content: '# persistent', locale }).ok, true);
      const restored = createEditorStateStore(root).load();
      assert.equal(initialDesktopLocale(restored.state, 'fr-FR'), locale);
    }
    assert.equal(createEditorStateStore(root).save({ content: '# rejected', locale: 'zh-HK' }).ok, false);
    assert.equal(createEditorStateStore(root).load().state.locale, 'ja');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
