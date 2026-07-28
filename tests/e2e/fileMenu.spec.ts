import { test, expect, openEditor, setSource } from './fixtures';
import type { Page } from '@playwright/test';

// 注入假的另存为对话框：window.__fakeSaveTarget 模拟用户挑选的新文件。
async function installFakeSavePicker(page: Page) {
  await page.addInitScript(() => {
    const state = { name: '另存目标.md', content: '', lastModified: 1000, savedCount: 0 };
    (window as unknown as Record<string, unknown>).__fakeSaveTarget = state;
    (window as unknown as Record<string, unknown>).showSaveFilePicker = async () => ({
      kind: 'file',
      name: state.name,
      async getFile() {
        const snapshot = state.content;
        return { name: state.name, lastModified: state.lastModified, text: async () => snapshot };
      },
      async createWritable() {
        let buffer = '';
        return {
          async write(data: string) { buffer = data; },
          async close() {
            state.content = buffer;
            state.lastModified += 1000;
            state.savedCount += 1;
          }
        };
      },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; }
    });
  });
}

test('顶栏文件菜单包含保存与另存为，点击外部关闭', async ({ page }) => {
  await openEditor(page);

  await page.getByRole('button', { name: '文件菜单' }).click();
  await expect(page.locator('.file-menu')).toHaveClass(/is-open/);
  const fileMenu = page.locator('.file-menu');
  await expect(fileMenu.getByRole('menuitem', { name: /^保存/ })).toBeVisible();
  await expect(fileMenu.getByRole('menuitem', { name: /另存为/ })).toBeVisible();

  await page.locator('.md-source').click();
  await expect(page.locator('.file-menu')).not.toHaveClass(/is-open/);
});

test('另存为把内容写入新文件并切换关联', async ({ page }) => {
  await installFakeSavePicker(page);
  await openEditor(page);
  await setSource(page, '# 副本内容');

  await page.getByRole('button', { name: '文件菜单' }).click();
  await page.locator('.file-menu').getByRole('menuitem', { name: /另存为/ }).click();

  await expect(page.locator('.file-name')).toHaveText('另存目标.md');
  await expect(page.locator('.save-status')).toHaveText(/已保存到 另存目标\.md/);
  await page.waitForFunction(() =>
    ((window as unknown as Record<string, { content: string }>).__fakeSaveTarget).content.includes('副本内容')
  );

  // 另存为之后继续编辑，内容应写穿到新文件（关联已切换）
  await setSource(page, '# 副本内容\n\n继续编辑');
  await page.waitForFunction(() =>
    ((window as unknown as Record<string, { content: string }>).__fakeSaveTarget).content.includes('继续编辑')
  );
});

test('⌘⇧S 快捷键触发另存为', async ({ page }) => {
  await installFakeSavePicker(page);
  await openEditor(page);
  await setSource(page, '# 快捷键另存');

  await page.keyboard.press('ControlOrMeta+Shift+KeyS');

  await expect(page.locator('.file-name')).toHaveText('另存目标.md');
  await page.waitForFunction(() =>
    ((window as unknown as Record<string, { content: string }>).__fakeSaveTarget).content.includes('快捷键另存')
  );
});
