import { test as base, expect, type Page } from '@playwright/test';

// 屏蔽对外部域名的请求（Google Fonts 等），保证 E2E 离线可复现、不受网络波动影响。
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(
      (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
      (route) => route.abort()
    );
    await use(page);
  }
});

export { expect };

// 直达编辑器并等待首屏初始化完成（预览渲染出示例文档即视为就绪）。
export async function openEditor(page: Page) {
  await page.goto('/#editor');
  await expect(page.locator('.md-source')).toBeVisible();
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
}

// 替换 Markdown 原文。fill 会触发 input 事件，走与真实输入相同的渲染/存档路径。
export async function setSource(page: Page, markdown: string) {
  await page.locator('.md-source').fill(markdown);
}

// 选中原文中某段文字，供工具栏格式化命令使用。
export async function selectInSource(page: Page, text: string) {
  await page.locator('.md-source').evaluate((el, target) => {
    const source = el as HTMLTextAreaElement;
    const start = source.value.indexOf(target);
    if (start < 0) throw new Error(`source does not contain: ${target}`);
    source.focus();
    source.setSelectionRange(start, start + target.length);
  }, text);
}

// Preferences are fixed in the workspace sidebar, with a focus-mode shortcut.
export async function openAppearance(page: Page) {
  await expect(page.locator('.md-source')).toHaveAttribute('lang', /.*/);
  const panel = page.locator('.reading-appearance-panel');
  if (!(await panel.isVisible())) {
    if (await page.locator('.focus-settings-button').isVisible()) {
      await page.locator('.focus-settings-button').click();
    } else {
      const sidebarClosed = await page.locator('.document-sidebar').evaluate(sidebar =>
        window.matchMedia('(max-width: 760px)').matches
          ? !sidebar.classList.contains('is-mobile-open') : sidebar.classList.contains('is-collapsed'));
      if (sidebarClosed) await page.locator('.document-toggle').click();
      await page.locator('.workspace-settings-button').click();
    }
  }
  await panel.locator('[data-settings-tab="reading"]').click();
  await expect(panel).toBeVisible();
}

export async function openAISettings(page: Page) {
  await openAppearance(page);
  await page.locator('[data-settings-tab="ai"]').click();
  await page.locator('.settings-entry').click();
  await expect(page.locator('.ai-settings-overlay')).toBeVisible();
}

// Font import and licensing details live behind an optional disclosure.
export async function openFontManagement(page: Page) {
  await openAppearance(page);
  const details = page.locator('.reading-font-management');
  if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) {
    await details.locator('summary').click();
  }
}
