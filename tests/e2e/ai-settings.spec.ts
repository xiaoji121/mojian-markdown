import { test, expect, openEditor, openAISettings } from './fixtures';

test('desktop settings disclose migration and clear unsaved passwords on close/reopen', async ({ page }) => {
  await openEditor(page);
  // Inject only the narrow IPC contract after normal editor initialization. No
  // provider request, real key, or operating-system secret store is used here.
  await page.evaluate(() => {
    // The default web build hides bridge-only controls. Expose that presentation
    // for this injected IPC fixture; actual desktop wiring is tested separately.
    document.body.classList.add('agent-bridge-enabled');
    let migrated = false;
    (window as any).mojianDesktop = {
      aiSettings: async (operation, payload) => {
        if (operation === 'migrate' && payload?.consent === true) migrated = true;
        return { ok: true, value: { providers: { gemini: {
          configured: migrated, credentialStatus: migrated ? 'saved' : 'migration-required',
          model: 'gemini-2.5-flash', proxy: ''
        } }, secureStorage: { available: true, status: 'available' } } };
      }
    };
  });
  const open = async () => {
    await openAISettings(page);
    await expect(page.locator('.ai-settings-overlay')).toBeVisible();
  };
  await open();
  await expect(page.locator('.ai-settings-note')).toContainText('点击“同意迁移”');
  await page.getByRole('button', { name: '同意迁移旧明文 Key', exact: true }).click();
  await expect(page.locator('.ai-settings-migrate')).toBeHidden();
  const key = page.locator('.ai-settings-modal input[type=password]');
  await key.fill('FAKE-ONLY-unsaved-password');
  await page.locator('.ai-settings-modal').getByRole('button', { name: '关闭', exact: true }).click();
  await expect(key).toHaveValue('');
  await open();
  await expect(key).toHaveValue('');
  await expect(key).toHaveAttribute('placeholder', '已配置，留空保持不变');
  await expect(page.locator('.ai-settings-note')).toContainText('保存不联网');
});

async function installSettingsFixture(page) {
  await openEditor(page);
  await page.evaluate(() => {
    document.body.classList.add('agent-bridge-enabled');
    (window as any).settingsTestCalls = 0;
    (window as any).mojianDesktop = {
      aiSettings: async (operation) => {
        if (operation === 'test') {
          (window as any).settingsTestCalls++;
          return new Promise(resolve => { (window as any).finishSettingsTest = () => resolve({ ok: true, value: { ok: true } }); });
        }
        return { ok: true, value: { providers: { gemini: {
          configured: true, credentialStatus: 'saved', model: 'gemini-2.5-flash', proxy: ''
        } }, secureStorage: { available: true, status: 'available' } } };
      }
    };
  });
}

async function openSettings(page) {
  await openAISettings(page);
  await expect(page.getByRole('dialog', { name: 'AI 设置' })).toBeVisible();
}

test('Gemini-only test disclosure survives results and changes invalidate pending and completed tests', async ({ page }) => {
  await installSettingsFixture(page);
  await openSettings(page);
  const dialog = page.getByRole('dialog', { name: 'AI 设置' });
  await dialog.getByRole('radio', { name: 'Codex Codex CLI', exact: true }).click();
  const testButton = dialog.getByRole('button', { name: '测试 Gemini 连接', exact: true });
  const disclosure = dialog.locator('.ai-settings-disclosure');
  for (const text of ['Google', '费用', '已保存']) await expect(disclosure).toContainText(text);
  await testButton.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(testButton).toBeDisabled();
  expect(await page.evaluate(() => (window as any).settingsTestCalls)).toBe(1);
  await dialog.getByLabel('模型', { exact: true }).fill('gemini-new');
  await page.evaluate(() => (window as any).finishSettingsTest());
  await expect(dialog.getByRole('status')).toContainText('重新测试');
  await expect(testButton).toBeEnabled();
  await testButton.click();
  await page.evaluate(() => (window as any).finishSettingsTest());
  await expect(dialog.getByRole('status')).toContainText('Gemini 连接成功');
  await expect(disclosure).toContainText('Google');
  await dialog.getByLabel('Gemini API Key', { exact: true }).fill('FAKE-new-unsaved');
  await expect(dialog.getByRole('status')).toContainText('重新测试');
  await expect(dialog.getByRole('radio', { name: 'Codex Codex CLI', exact: true })).toHaveAttribute('aria-checked', 'true');
});

test('settings traps keyboard focus and Escape clears password and returns focus', async ({ page }) => {
  await installSettingsFixture(page);
  await openSettings(page);
  const dialog = page.getByRole('dialog', { name: 'AI 设置' });
  const first = dialog.getByRole('radio').first();
  const last = dialog.getByRole('button', { name: '保存', exact: true });
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await dialog.getByLabel('Gemini API Key', { exact: true }).fill('FAKE-key');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.settings-entry')).toBeFocused();
  await openSettings(page);
  await expect(dialog.getByLabel('Gemini API Key', { exact: true })).toHaveValue('');
});

test('closing a pending Gemini test cannot repopulate or mark a reopened form successful', async ({ page }) => {
  await installSettingsFixture(page);
  await openSettings(page);
  const dialog = page.getByRole('dialog', { name: 'AI 设置' });
  const testButton = dialog.getByRole('button', { name: '测试 Gemini 连接', exact: true });
  await testButton.click();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await openSettings(page);
  await expect(testButton).toBeDisabled();
  await dialog.getByLabel('Gemini API Key', { exact: true }).fill('FAKE-new');
  await page.evaluate(() => (window as any).finishSettingsTest());
  await expect(testButton).toBeEnabled();
  await expect(dialog.getByRole('status')).not.toContainText('连接成功');
  await expect(dialog.getByLabel('Gemini API Key', { exact: true })).toHaveValue('FAKE-new');
  expect(await page.evaluate(() => (window as any).settingsTestCalls)).toBe(1);
});

test('settings stays within a short viewport and its actions wrap without horizontal clipping', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 520 });
  await installSettingsFixture(page);
  await openSettings(page);
  const dialog = page.getByRole('dialog', { name: 'AI 设置' });
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(520);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const save = dialog.getByRole('button', { name: '保存', exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
});

for (const key of ['Escape', 'Tab']) {
  test(`keyboard-started Gemini test keeps ${key} inside the busy dialog`, async ({ page }) => {
    await installSettingsFixture(page);
    await openSettings(page);
    const dialog = page.getByRole('dialog', { name: 'AI 设置' });
    const testButton = dialog.getByRole('button', { name: '测试 Gemini 连接', exact: true });
    await testButton.focus();
    await page.keyboard.press('Enter');
    // Do not repair focus with a click: the very next keyboard action must work.
    await page.keyboard.press(key);
    if (key === 'Escape') {
      await expect(dialog).toBeHidden();
      await expect(page.locator('.settings-entry')).toBeFocused();
    } else {
      await expect(dialog.getByRole('radio').first()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
    expect(await page.evaluate(() => (window as any).settingsTestCalls)).toBe(1);
    await page.evaluate(() => (window as any).finishSettingsTest());
  });
}
