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
