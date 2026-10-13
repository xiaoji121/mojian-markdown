import { test, expect, openEditor } from './fixtures';
import { exercisePolish, polishContent } from './pcFinalPolishHelpers';

const papers = ['snow', 'parchment', 'cream', 'green', 'ink'];
for (const theme of ['light', 'dark']) for (const soft of [false, true]) for (const paper of papers) {
  for (const width of [900, 1100, 1440]) test(`polish ${theme} ${paper} soft=${soft} ${width}`, async ({ page }) => {
    const locale = ['zh-CN', 'zh-TW', 'en', 'ja'][(papers.indexOf(paper) + (soft ? 1 : 0)) % 4];
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(state => localStorage.setItem('md-editor-warm-v1', JSON.stringify(state)), {
      content: polishContent, fileName: '合成收尾验证.md', theme, paperLight: paper, paperDark: paper,
      softenDarkPaper: soft, fontSize: 18, locale,
      comments: [{ id: 'kept', quote: '合成文稿', note: '保留批注', type: 'idea', occ: 0, ts: 1 }]
    });
    await openEditor(page); await exercisePolish(page);
    await expect(page.locator('.md-source')).toHaveValue(polishContent);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('md-editor-warm-v1')!).comments[0].note)).toBe('保留批注');
  });
}
