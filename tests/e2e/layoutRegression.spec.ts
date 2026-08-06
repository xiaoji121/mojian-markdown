import { test, expect, openEditor } from './fixtures';

test('文件菜单的上传操作保持横排标题，并为不可用工具提供原因', async ({ page }) => {
  await openEditor(page);
  await page.locator('body').evaluate((body) => body.classList.add('agent-bridge-enabled'));
  await page.locator('.file-menu-toggle').click();

  const upload = page.getByRole('menuitem', { name: /上传到飞书文档/ });
  await expect(upload).toBeVisible();
  const box = await upload.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(58);
  await expect(upload.locator('.menu-item-hint')).toHaveCSS('width', /\d+px/);
  if (await upload.isDisabled()) await expect(upload).toHaveAttribute('title', /.+/);
  await expect(page.getByRole('menuitem', { name: /上传到钉钉文档/ })).toBeVisible();
});

test('AI 助手使用统一入口，不再要求用户选择技术模式', async ({ page }) => {
  await openEditor(page);

  await expect(page.locator('.ai-mode-switch')).toHaveCount(0);
  await expect(page.locator('.ai-composer-note')).toHaveText('默认只读 · 使用项目工具前会确认');
  await expect(page.locator('.ai-input')).toHaveAttribute('placeholder', /提问或描述要完成的事情/);
});

test('最近阅读长标题使用完整行宽，操作区以不透明浮层覆盖尾部', async ({ page }) => {
  await openEditor(page);
  await page.locator('.recent-document-list').evaluate((list) => {
    list.innerHTML = `
      <div class="recent-document-group">
        <button class="recent-document-item">
          <span class="recent-document-icon">▧</span>
          <span class="recent-document-body">
            <strong>当 AI 让代码变得廉价，程序员真正的杠杆是什么.md</strong>
            <small>22:42 · 0 批注 · 0 问答</small>
          </span>
        </button>
        <div class="recent-document-actions">
          <button class="recent-document-map">⌁</button>
          <button class="recent-document-delete">×</button>
          <button class="recent-document-pin">☆</button>
        </div>
      </div>`;
  });

  const group = page.locator('.recent-document-group');
  await group.hover();
  const [titleBox, actionsBox] = await Promise.all([
    group.locator('strong').boundingBox(),
    group.locator('.recent-document-actions').boundingBox(),
  ]);
  expect(titleBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  const itemPaddingRight = await group.locator('.recent-document-item').evaluate((item) =>
    Number.parseFloat(getComputedStyle(item).paddingRight),
  );
  const actionBackground = await group.locator('.recent-document-actions').evaluate((actions) =>
    getComputedStyle(actions).backgroundColor,
  );
  expect(itemPaddingRight).toBeLessThanOrEqual(12);
  expect(actionBackground).not.toBe('rgba(0, 0, 0, 0)');
});
