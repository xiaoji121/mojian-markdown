import { test, expect, openEditor, openAppearance } from './fixtures';

test('settings separate interface theme and keep font management collapsed', async ({ page }) => {
  await openEditor(page);
  await openAppearance(page);
  const panel = page.locator('.reading-appearance-panel');
  const theme = panel.locator('.appearance-theme');
  const heading = panel.locator('.appearance-reading-heading');
  expect((await theme.boundingBox())!.y).toBeLessThan((await heading.boundingBox())!.y);
  await expect(panel.locator('.reading-font-select')).toBeVisible();
  await expect(panel.locator('.reading-font-import')).toBeHidden();
  await expect(panel.locator('.reading-font-preview')).toBeVisible();
  const summary = panel.locator('.reading-font-management summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(panel.locator('.reading-font-import')).toBeVisible();
  await expect(panel.locator('.reading-font-import-status')).toContainText('桌面应用');
  await summary.click();
  await expect(panel.locator('.reading-font-import')).toBeHidden();
});

test('editor header uses the document name without the logo and product name', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('.app-header .brand-mark, .app-header .brand-title')).toHaveCount(0);
  await expect(page.locator('.file-name')).toBeVisible();
  await page.locator('.file-name').dblclick();
  await expect(page.locator('.file-name')).toHaveAttribute('contenteditable', 'true');
});

for (const paper of ['ink', 'green', 'snow']) {
  test(`immersive settings live in reading toolbar on ${paper} paper`, async ({ page }) => {
    await openEditor(page);
    await openAppearance(page);
    if (await page.locator('body').getAttribute('data-theme') !== 'dark') {
      await page.locator('.appearance-theme').click();
    }
    await page.locator(`.paper-dot[data-paper="${paper}"]`).click();
    await page.locator('.reading-appearance-panel .appearance-close').click();
    await page.getByRole('button', { name: '沉浸式阅读', exact: true }).click();
    await expect(page.locator('.focus-settings-button')).toBeHidden();
    const button = page.locator('.reading-toolbar-settings');
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator('.reading-appearance-panel')).toBeVisible();
  });
}

test('recent reading stays open while switching documents and answers until explicitly closed', async ({ page }) => {
  const documents = ['one', 'two'].map(id => ({ documentId: id, fileName: `${id}.md`,
    content: `# ${id}`, updatedAt: '2026-10-09T00:00:00Z', annotationCount: 0, questionCount: 1,
    answerDocuments: [{ requestId: `${id}-answer`, question: `${id} question` }],
    annotations: [], messages: [{ requestId: `${id}-answer`, question: `${id} question`, answer: `${id} answer` }] }));
  await page.route('**/src/editor/featureFlags.ts', route => route.fulfill({
    contentType: 'application/javascript', body: 'export const ENABLE_AGENT_BRIDGE = true;'
  }));
  await page.route('http://127.0.0.1:4317/**', route => {
    const path = new URL(route.request().url()).pathname;
    const doc = documents.find(item => path === `/api/documents/${item.documentId}`);
    return route.fulfill({ json: doc ? { document: doc } : { documents } });
  });
  await openEditor(page);
  const sidebar = page.locator('.document-sidebar');
  if (await sidebar.evaluate(el => el.classList.contains('is-collapsed'))) {
    await page.locator('.document-toggle').click();
  }
  for (const id of ['two', 'one']) {
    await page.locator('.recent-document-item').filter({ hasText: `${id}.md` }).click();
    await expect(page.locator('.md-preview h1').first()).toHaveText(id);
    await expect(sidebar).not.toHaveClass(/is-collapsed/);
    await expect(page.locator('.document-toggle')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('.recent-answer-item').filter({ hasText: `${id} question` }).click();
    await expect(page.locator('.md-preview')).toContainText(`${id} answer`);
    await expect(sidebar).not.toHaveClass(/is-collapsed/);
  }
  await page.getByRole('button', { name: '关闭最近阅读', exact: true }).click();
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await page.locator('.document-toggle').click();
  await expect(sidebar).not.toHaveClass(/is-collapsed/);
});
