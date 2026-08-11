import { test, expect, openEditor } from './fixtures';

const settings = {
  gemini: { configured: false, apiKeyTail: '', model: 'gemini-2.5-flash', proxy: '', baseURL: '' },
  kimi: { configured: true, apiKeyTail: '2233', model: 'kimi-k2.5', proxy: '', baseURL: 'https://api.moonshot.cn/v1' },
  qwen: { configured: false, apiKeyTail: '', model: 'qwen-plus', proxy: '', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  custom: { configured: false, apiKeyTail: '', model: '', proxy: '', baseURL: '' }
};

test('AI 设置可选择国内 API Agent 并展示对应配置', async ({ page }) => {
  await page.route('http://127.0.0.1:4317/api/settings', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settings) });
  });
  await openEditor(page);
  await page.locator('body').evaluate((body) => body.classList.add('agent-bridge-enabled'));
  await page.getByRole('button', { name: '打开设置' }).click();

  const modal = page.locator('.ai-settings-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('radio')).toHaveCount(6);
  await modal.getByRole('radio', { name: /Kimi/ }).click();
  await expect(modal.getByLabel('模型')).toHaveValue('kimi-k2.5');
  await expect(modal.getByLabel('接口地址')).toHaveValue('https://api.moonshot.cn/v1');
  await expect(modal.getByLabel('API Key')).toHaveAttribute('placeholder', /2233/);
  await expect(modal.getByRole('button', { name: '保存' })).toBeVisible();
});

