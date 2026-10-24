import { test, expect, openEditor } from './fixtures';
import type { Page } from '@playwright/test';

// 浏览器版（无 Agent Bridge）：最近阅读保存在 IndexedDB，可在多篇之间切换，刷新后仍在。

test.beforeEach(async ({ page }) => {
  // 走 <input type=file> 回退路径，方便用 filechooser 注入文件。
  await page.addInitScript(() => { delete (window as unknown as Record<string, unknown>).showOpenFilePicker; });
});

async function openSidebar(page: Page) {
  const sidebar = page.locator('.document-sidebar');
  if (await sidebar.evaluate(el => el.classList.contains('is-collapsed'))) {
    await page.locator('.document-toggle').click();
  }
  await expect(sidebar).not.toHaveClass(/is-collapsed/);
}

async function importMarkdown(page: Page, name: string, text: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.document-sidebar').getByRole('button', { name: '导入 Markdown' }).click();
  await (await chooser).setFiles({ name, mimeType: 'text/markdown', buffer: Buffer.from(text) });
  await expect(page.locator('.md-preview h1').first()).toHaveText(text.split('\n')[0].replace('# ', ''));
}

const row = (page: Page, name: string) => page.locator('.recent-document-item').filter({ hasText: name });

test('浏览器版最近阅读保留多篇，可切换、刷新后仍在、可删除', async ({ page }) => {
  await openEditor(page);
  await openSidebar(page);

  await importMarkdown(page, '甲.md', '# 甲\n\n第一篇');
  await importMarkdown(page, '乙.md', '# 乙\n\n第二篇');
  await expect(row(page, '甲.md')).toHaveCount(1);
  await expect(row(page, '乙.md')).toHaveCount(1);
  await expect(row(page, '乙.md')).toHaveClass(/is-active/);
  // 上一篇已存进最近阅读，换文档不再确认「打开另一篇文稿？」
  await expect(page.getByRole('dialog', { name: '打开另一篇文稿？' })).toHaveCount(0);

  await row(page, '甲.md').click();
  await expect(page.locator('.md-preview h1').first()).toHaveText('甲');
  await expect(row(page, '甲.md')).toHaveClass(/is-active/);

  await page.reload();
  await expect(page.locator('.md-preview h1').first()).toHaveText('甲');
  await openSidebar(page);
  await expect(row(page, '甲.md')).toHaveCount(1);
  await expect(row(page, '乙.md')).toHaveCount(1);
  await expect(page.locator('.recent-document-list')).toContainText('最近阅读保存在此浏览器');

  page.once('dialog', dialog => dialog.accept());
  const group = page.locator('.recent-document-group').filter({ hasText: '乙.md' });
  await group.hover();
  await group.locator('.recent-document-delete').click();
  await expect(row(page, '乙.md')).toHaveCount(0);
  await expect(row(page, '甲.md')).toHaveCount(1);
});

test.describe('手机触屏', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  async function mobileImport(page: Page, name: string, text: string) {
    await page.locator('.document-toggle').first().click();
    await page.locator('.open-doc-btn').click();
    await expect(page.locator('.mobile-file-sheet')).toContainText('当前这篇会留在最近阅读里');
    await expect(page.locator('[data-mobile-file-backup]')).toHaveCount(0);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-mobile-file-pick]').click();
    await (await chooser).setFiles({ name, mimeType: 'text/markdown', buffer: Buffer.from(text) });
    await expect(page.locator('.md-preview h1').first()).toHaveText(text.split('\n')[0].replace('# ', ''));
    // 不再出现「导入会替换当前内容」确认
    await expect(page.locator('[data-mobile-file-confirm]')).toHaveCount(0);
  }

  test('导入不再要求确认替换，上一篇留在列表；每条与操作按钮同一行', async ({ page }) => {
    await page.goto('/#editor');
    await expect(page.locator('.md-preview h1').first()).toBeVisible();
    await mobileImport(page, '甲.md', '# 甲\n\n第一篇');
    await mobileImport(page, '乙.md', '# 乙\n\n第二篇');

    await page.locator('.document-toggle').first().click();
    await expect(row(page, '甲.md')).toHaveCount(1);
    const group = page.locator('.recent-document-group').filter({ hasText: '甲.md' });
    // 侧栏是滑入的底部面板：在同一帧里量，避免动画中两次测量错位
    const m = await group.evaluate((g) => {
      const r = (el: Element | null) => el!.getBoundingClientRect();
      const item = r(g.querySelector('.recent-document-item'));
      const actions = r(g.querySelector('.recent-document-actions'));
      const buttons = [...g.querySelectorAll('.recent-document-actions button')].map(b => r(b).height);
      return { group: r(g).height, dy: Math.abs(actions.top - item.top), right: item.right, actionsLeft: actions.left, buttons };
    });
    expect(m.group).toBeLessThanOrEqual(56);
    expect(m.dy).toBeLessThanOrEqual(1);
    expect(m.actionsLeft).toBeGreaterThanOrEqual(m.right - 1);
    expect(Math.min(...m.buttons)).toBeGreaterThanOrEqual(32);

    await row(page, '甲.md').click();
    await expect(page.locator('.md-preview h1').first()).toHaveText('甲');
  });
});
