import { chooseLanguage } from '../e2e/localeHelpers';
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mockCliEnv } from '../helpers/mockCli';
import { closeEditorWindow } from './restartScenarios';

test('language switches persist across real desktop restarts and update native menus', async ({}, testInfo) => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), 'mojian-native-locale-'));
  const userData = join(root, 'user');
  const home = join(root, 'empty-home');
  await mkdir(home);
  const launch = () => electron.launch({
    args: ['.', '--lang=en-US', '--disable-background-networking', '--use-mock-keychain',
      '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=localhost;127.0.0.1;[::1]'],
    env: { ...mockCliEnv(root), HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
      ...(process.env.DISPLAY ? { DISPLAY: process.env.DISPLAY } : {}),
      ...(process.env.XAUTHORITY ? { XAUTHORITY: process.env.XAUTHORITY } : {}),
      MOJIAN_USER_DATA: userData, AGENT_BRIDGE_WORKSPACE: root, NO_PROXY: 'localhost,127.0.0.1' }
  });
  let app = await launch();
  const fileLabel = () => app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items
    .find(item => item.submenu?.items.some(child => child.accelerator === 'CmdOrCtrl+N'))!.label);
  try {
    let page = await app.firstWindow();
    await expect(page.locator('.md-source')).toBeVisible();
    expect(await fileLabel()).toBe('File');
    const content = '# 保持される下書き\n\n中文 English 日本語\n';
    for (const [locale, label] of [['zh-TW', '檔案'], ['ja', 'ファイル'], ['zh-CN', '文件'], ['en', 'File']]) {
      await page.locator('.md-source').fill(content);
      await chooseLanguage(page, locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      expect(await fileLabel()).toBe(label);
      await page.screenshot({ path: testInfo.outputPath(`desktop-${locale}.png`) });
      await closeEditorWindow(app);
      app = await launch();
      page = await app.firstWindow();
      await expect(page.locator('.md-source')).toHaveValue(content);
      await expect(page.locator('html')).toHaveAttribute('data-editor-locale', locale);
      expect(await fileLabel()).toBe(label);
    }
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
