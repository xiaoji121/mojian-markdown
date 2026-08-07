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
  await expect(upload.locator('.menu-item-hint')).toHaveText('上传完成后自动打开');
  if (await upload.isDisabled()) await expect(upload).toHaveAttribute('title', /.+/);
  const dingtalkUpload = page.getByRole('menuitem', { name: /上传到钉钉云盘/ });
  await expect(dingtalkUpload).toBeVisible();
  await expect(dingtalkUpload.locator('.menu-item-hint')).toHaveText('保留 .md 文件，不转在线文档');
});

test('文档上传反馈以顶部 Toast 显性展示', async ({ page }) => {
  await openEditor(page);
  const toast = page.locator('.publish-toast');
  await toast.evaluate((element) => {
    element.classList.add('is-visible');
    (element as HTMLElement).dataset.state = 'loading';
  });

  await expect(toast).toBeVisible();
  await expect(toast).toHaveCSS('position', 'fixed');
  await expect(toast.locator('.publish-toast-title')).toHaveText('正在上传');
  await expect(toast.locator('.publish-toast-detail')).toContainText('请稍候');
});

test('AI 问答失败卡片里的重试操作清晰可见', async ({ page }) => {
  await openEditor(page);
  await page.locator('body').evaluate((body) => body.classList.add('agent-bridge-enabled'));
  const panel = page.locator('.ai-panel');
  await panel.evaluate((element) => { (element as HTMLElement).style.display = 'flex'; });
  await panel.locator('.ai-messages').evaluate((messages) => {
    messages.innerHTML = `
      <article class="ai-message ai-message-assistant">
        <div class="ai-message-label">CODEX</div>
        <div class="ai-message-body">Agent 执行失败：Codex CLI 未就绪</div>
        <div class="ai-message-actions"><button class="ai-message-retry">重试</button></div>
      </article>`;
  });

  const retry = panel.getByRole('button', { name: /重试/ });
  await expect(retry).toBeVisible();
  await expect(retry).toHaveCSS('cursor', 'pointer');
});

test('AI 助手使用统一入口，不再要求用户选择技术模式', async ({ page }) => {
  await openEditor(page);

  await expect(page.locator('.ai-mode-switch')).toHaveCount(0);
  await expect(page.locator('.ai-composer-note')).toHaveText('默认只读 · 修改文件时逐次确认');
  await expect(page.locator('.ai-input')).toHaveAttribute('placeholder', /提问或描述要完成的事情/);
});

test('没有待发送划线时当前引用模块自动收起', async ({ page }) => {
  await openEditor(page);
  await page.locator('body').evaluate((body) => body.classList.add('agent-bridge-enabled'));
  const panel = page.locator('.ai-panel');
  await panel.evaluate((element) => { (element as HTMLElement).style.display = 'flex'; });

  await expect(panel.locator('.ai-status')).toBeVisible();
  await expect(panel.locator('.ai-overline')).toBeHidden();
  await expect(panel.locator('.ai-quote')).toBeHidden();
  await expect(panel.locator('.ai-quick-row')).toBeHidden();

  await panel.locator('.ai-context').evaluate((context) => context.classList.add('has-quote'));
  await expect(panel.locator('.ai-overline')).toBeVisible();
  await expect(panel.locator('.ai-quote')).toBeVisible();
  await expect(panel.locator('.ai-quick-row')).toBeVisible();
});

test('阅读树问答节点悬停时显示移除操作', async ({ page }) => {
  await openEditor(page);
  await page.locator('body').evaluate((body) => body.classList.add('agent-bridge-enabled'));
  const list = page.locator('.recent-document-list');
  await list.evaluate((element) => {
    element.innerHTML = `
      <div class="recent-document-children">
        <div class="recent-answer-row">
          <button class="recent-answer-item"><span class="recent-answer-body"><strong>临时问题</strong></span></button>
          <button class="recent-answer-hide" aria-label="从阅读树移除 临时问题">−</button>
        </div>
      </div>`;
  });

  const remove = page.getByRole('button', { name: '从阅读树移除 临时问题' });
  await expect(remove).toHaveCSS('opacity', '0');
  await page.getByText('临时问题').hover();
  await expect(remove).toHaveCSS('opacity', '1');
});

test('Agent 卡片显性展示执行过程，并标记可用墨笺打开的 Markdown', async ({ page }) => {
  await openEditor(page);
  await page.locator('body').evaluate((body) => body.classList.add('agent-bridge-enabled'));
  const panel = page.locator('.ai-panel');
  await panel.evaluate((element) => { (element as HTMLElement).style.display = 'flex'; });
  await panel.locator('.ai-messages').evaluate((messages) => {
    messages.innerHTML = `
      <article class="ai-message ai-message-assistant is-pending">
        <div class="ai-message-label">CODEX</div>
        <details class="ai-agent-progress" open>
          <summary>执行中 · 3 步</summary>
          <ol><li class="is-done">完成一步分析</li><li class="is-running">正在执行命令</li></ol>
        </details>
        <div class="ai-message-body">
          已生成：<a class="ai-local-markdown-link" href="#">生成结果.md</a>
        </div>
      </article>`;
  });

  await expect(panel.getByText('执行中 · 3 步')).toBeVisible();
  await expect(panel.getByText('正在执行命令')).toBeVisible();
  const markdown = panel.getByRole('link', { name: /生成结果\.md/ });
  await expect(markdown).toBeVisible();
  await expect(markdown).toHaveCSS('color', /.+/);
  expect(await markdown.evaluate((link) => getComputedStyle(link, '::after').content)).toContain('用墨笺打开');
});

test('AI 历史中已移除的问答提供恢复阅读树操作', async ({ page }) => {
  await openEditor(page);
  await page.locator('body').evaluate((body) => body.classList.add('agent-bridge-enabled'));
  const panel = page.locator('.ai-panel');
  await panel.evaluate((element) => { (element as HTMLElement).style.display = 'flex'; });
  await panel.locator('.ai-messages').evaluate((messages) => {
    messages.innerHTML = `
      <article class="ai-message ai-message-assistant">
        <div class="ai-message-label">CODEX</div>
        <div class="ai-message-body">这是仍然保留的历史回答</div>
        <div class="ai-message-actions">
          <button class="ai-reading-tree-restore">重新加入阅读树</button>
        </div>
      </article>`;
  });

  const restore = panel.getByRole('button', { name: '重新加入阅读树' });
  await expect(restore).toBeVisible();
  await expect(restore).toHaveCSS('cursor', 'pointer');
});

test('最近阅读长标题使用完整行宽，操作区以不透明浮层覆盖尾部', async ({ page }) => {
  await openEditor(page);
  await page.locator('body').evaluate((body) => body.classList.add('agent-bridge-enabled'));
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
