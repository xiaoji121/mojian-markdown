import { test, expect, openEditor, setSource } from './fixtures';
import type { Page } from '@playwright/test';

// 注入假的 File System Access API：window.__fakeLocalFile 模拟磁盘上的真实文件，
// 测试通过直接读写它来验证「编辑器 ↔ 本地文件」双向同步。
async function installFakeLocalFile(page: Page, content: string) {
  await page.addInitScript((initial: string) => {
    const state = { name: '本地笔记.md', content: initial, lastModified: 1000, written: [] as string[] };
    (window as unknown as Record<string, unknown>).__fakeLocalFile = state;
    const handle = {
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
            state.written.push(buffer);
          }
        };
      },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; }
    };
    (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [handle];
  }, content);
}

async function openFakeLocalFile(page: Page) {
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.locator('.file-menu').getByRole('menuitem', { name: /^打开/ }).click();
  await expect(page.locator('.md-source')).toHaveValue(/原始内容/);
  // 正文会先出现，随后才完成工作区认领与本地句柄初始化；等打开流程真正结束再编辑。
  await expect(page.locator('.save-status')).toContainText('已打开 · 本地笔记.md');
}

test('编辑内容自动写回打开的本地文件', async ({ page }) => {
  await installFakeLocalFile(page, '# 本地笔记\n\n原始内容');
  await openEditor(page);
  await openFakeLocalFile(page);

  await setSource(page, '# 本地笔记\n\n编辑后的内容');

  await page.waitForFunction(() =>
    ((window as unknown as Record<string, { content: string }>).__fakeLocalFile).content.includes('编辑后的内容')
  );
});

test('关联文件夹后显示文档的本地相对路径', async ({ page }) => {
  await installFakeLocalFile(page, '# 本地笔记\n\n原始内容');
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).showDirectoryPicker = async () => ({
      kind: 'directory',
      name: '我的笔记',
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
      async resolve(handle: { name?: string }) {
        return handle && handle.name === '本地笔记.md' ? ['阅读', '本地笔记.md'] : null;
      }
    });
  });
  await openEditor(page);
  await openFakeLocalFile(page);

  await page.getByRole('button', { name: '更多操作' }).click();
  const folderItem = page.getByRole('menuitem', { name: /关联本地文件夹/ });
  // 菜单项自带用途说明：hover 提示 + 常显副标题
  await expect(folderItem).toHaveAttribute('title', /本地路径/);
  await expect(folderItem.locator('.menu-item-hint')).toContainText('本地路径');
  await folderItem.click();

  await expect(page.locator('.file-name')).toHaveAttribute(
    'title', '我的笔记/阅读/本地笔记.md\n双击重命名'
  );
});

test('本地文件被外部程序修改后编辑器自动更新', async ({ page }) => {
  await installFakeLocalFile(page, '# 本地笔记\n\n原始内容');
  await openEditor(page);
  await openFakeLocalFile(page);

  await page.evaluate(() => {
    const state = (window as unknown as Record<string, { content: string; lastModified: number }>).__fakeLocalFile;
    state.content = '# 本地笔记\n\n外部程序改动的内容';
    state.lastModified += 5000;
  });

  await expect(page.locator('.md-source')).toHaveValue(/外部程序改动的内容/, { timeout: 10_000 });
});
