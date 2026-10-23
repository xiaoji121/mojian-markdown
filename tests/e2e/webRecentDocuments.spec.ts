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
  // 当前已有正文时，PC 布局会先确认「打开另一篇文稿？」
  const confirm = page.getByRole('dialog', { name: '打开另一篇文稿？' });
  if (await confirm.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false)) {
    await confirm.getByRole('button', { name: '打开文件' }).click();
  }
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
