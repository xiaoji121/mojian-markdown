import { test, expect, openEditor, setSource } from './fixtures';
import { contrast, readingSamples, sourceSamples } from './pcContrastHelpers';

const content = '# 分屏矩阵\n\n正文与批注高亮，查找词。\n\n[链接](https://example.invalid) 与 `inlineCode`。\n\n```ts\n// 查找词\nconst title = "合成文稿";\nconst count = 42;\nfunction readAgain(note: string) { return note; }\n```\n\n> 引用文字\n\n' + '保持文稿与滚动。\n\n'.repeat(60);
async function seed(page, theme = 'dark', paper = 'snow', soft = true) {
  await page.addInitScript(state => localStorage.setItem('md-editor-warm-v1', JSON.stringify(state)), {
    content, theme, paperDark: paper, paperLight: paper, softenDarkPaper: soft,
    comments: [{ id: 'keep', quote: '批注高亮', note: '保留批注', type: 'idea', occ: 0, ts: 1 }],
  });
  await openEditor(page); await page.evaluate(() => document.fonts.ready);
}
async function assertContrast(page, samples) {
  const pairs = await contrast(page, samples);
  expect(pairs.length).toBeGreaterThan(0);
  expect(pairs.filter(p => p.ratio < p.minimum)).toEqual([]);
}

for (const theme of ['light', 'dark']) for (const soft of [false, true]) for (const paper of ['snow', 'parchment', 'cream', 'green', 'ink']) {
  test(`split contrast ${theme} ${paper} soften=${soft}`, async ({ page }) => {
    await seed(page, theme, paper, soft);
    for (const width of [900, 1100, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await assertContrast(page, [...sourceSamples, ...readingSamples,
        ['.editor-divider', '', 'background-color', 3, '.source-editor-area'],
        ['.editor-divider', '', 'background-color', 3, '.md-preview']]);
    }
    await page.locator('.search-toggle').click(); await page.getByRole('textbox', { name: '搜索文本', exact: true }).fill('查找词');
    await expect(page.locator('.source-mark')).toHaveCount(2); await assertContrast(page, sourceSamples);
    await page.getByRole('button', { name: '查找文档', exact: true }).click(); await page.locator('.preview-search-input').fill('查找词');
    await expect(page.locator('.preview-search-count')).toContainText('2'); await assertContrast(page, readingSamples);
    const find = page.getByRole('button', { name: '查找文档', exact: true }); await find.hover(); await find.focus();
    await expect.poll(async () => (await contrast(page, [['.reading-toolbar .tbtn'], ['.reading-toolbar .tbtn', '', 'outline-color', 3, '.reading-toolbar']])).filter(p => p.ratio < p.minimum)).toEqual([]);
  });
}

for (const width of [900, 1100, 1440]) for (const panel of ['comments', 'ai']) for (const theme of ['light', 'dark']) {
  test(`split toolbar ${width} ${panel} ${theme}: keyboard, contrast and navigation state`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/src/editor/featureFlags.ts', r => r.fulfill({ contentType: 'application/javascript', body: 'export const ENABLE_AGENT_BRIDGE = true;' }));
    await page.route('http://127.0.0.1:4317/**', r => r.fulfill({ json: { bridgeAvailable: true, providers: { codex: { executable: 'missing' } }, documents: [], messages: [], conversations: [] } }));
    await seed(page, theme); await setSource(page, content + '新修改');
    const source = page.locator('.md-source'); await source.evaluate((el: HTMLTextAreaElement) => { el.setSelectionRange(3, 7); el.scrollTop = 220; });
    const before = await source.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd, el.scrollTop]);
    await page.locator(panel === 'ai' ? '.header-actions .ai-entry' : '.header-actions button[aria-label="批注"]').click();
    await expect(page.locator('.document-sidebar')).not.toHaveClass(/is-collapsed/);
    for (const pane of ['.source-pane', '.preview-pane']) {
      const buttons = page.locator(`${pane} > .pane-toolbar button:visible`);
      let first = true;
      for (let i = 0; i < await buttons.count(); i++) {
        const button = buttons.nth(i); if (await button.isDisabled()) continue;
        if (first) { await button.focus(); first = false; } else await page.keyboard.press('Tab');
        await expect(button).toBeFocused();
        const b = (await button.boundingBox())!, p = (await page.locator(pane).boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(p.x); expect(b.x + b.width).toBeLessThanOrEqual(p.x + p.width + .5);
      }
    }
    await assertContrast(page, [['.pc-comment-footer'], ['.comment-quote'], ['.comment-note-input'], ['.ai-composer-note'], ['.ai-input', '::placeholder'], ['.pc-ai-state']]);
    await page.locator(`.${panel === 'ai' ? 'ai' : 'comments'}-panel .panel-close`).click();
    expect(await source.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd, el.scrollTop])).toEqual(before);
    await source.focus(); await page.keyboard.press('ControlOrMeta+z'); await expect(source).toHaveValue(content);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('md-editor-warm-v1')!).comments[0].note)).toBe('保留批注');
  });
}

for (const panel of ['comments', 'ai']) test(`900px ${panel}: search inputs and all search actions stay inside each pane`, async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.route('**/src/editor/featureFlags.ts', r => r.fulfill({ contentType: 'application/javascript', body: 'export const ENABLE_AGENT_BRIDGE = true;' }));
  await page.route('http://127.0.0.1:4317/**', r => r.fulfill({ json: { documents: [], providers: {} } }));
  await seed(page); await page.locator(panel === 'ai' ? '.header-actions .ai-entry' : '.header-actions button[aria-label="批注"]').click();
  await page.locator('.search-toggle').click(); await page.locator('.source-pane .search-input:not(.replace-input)').fill('查找词');
  await page.getByRole('button', { name: '查找文档', exact: true }).click(); await page.locator('.preview-search-input').fill('查找词');
  for (const pane of ['.source-pane', '.preview-pane']) {
    const p = (await page.locator(pane).boundingBox())!;
    const controls = page.locator(`${pane} [role=search] :is(input,button):visible`);
    for (let i = 0; i < await controls.count(); i++) {
      const control = controls.nth(i), b = (await control.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(p.x); expect(b.x + b.width).toBeLessThanOrEqual(p.x + p.width + .5);
    }
  }
  await page.locator('.pc-format-toggle').focus(); await page.keyboard.press('ArrowDown');
  await expect(page.locator('.pc-format-menu button').first()).toBeFocused();
  await page.keyboard.press('End'); await expect(page.locator('.pc-format-menu button').last()).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('.pc-format-toggle')).toBeFocused();
  await expect(page.locator('.md-source')).toHaveValue(content);
});
