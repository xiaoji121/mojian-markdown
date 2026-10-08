import { test, expect, openEditor } from './fixtures';

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
    await page.getByRole('button', { name: '更多操作', exact: true }).click();
    await page.locator('.settings-entry').click();
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
