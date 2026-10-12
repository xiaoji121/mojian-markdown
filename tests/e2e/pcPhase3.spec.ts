import { test, expect, openEditor, setSource, selectInSource } from './fixtures';

test('PC format menu preserves selected text, is keyboard operable and participates in undo', async ({ page }) => {
  await openEditor(page); await setSource(page, '# 文稿\n\n保留这段文字');
  await selectInSource(page, '这段文字');
  const trigger = page.locator('.pc-format-toggle');
  await trigger.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.locator('.pc-format-menu')).toBeVisible();
  await expect(page.locator('.pc-format-menu button').last()).toBeInViewport();
  await page.getByRole('menuitem', { name: '加粗', exact: true }).click();
  await expect(page.locator('.md-source')).toHaveValue('# 文稿\n\n保留**这段文字**');
  await expect(page.locator('.md-source')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.md-source')).toHaveValue('# 文稿\n\n保留这段文字');
  await trigger.click(); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
});

test('PC invalid regex disables mutations and recovers; Escape returns focus without content loss', async ({ page }) => {
  await openEditor(page); await setSource(page, '# Search\n\nalpha alpha');
  await page.keyboard.press('Control+h');
  await page.getByRole('button', { name: '使用正则表达式', exact: true }).click();
  await page.locator('.search-bar .search-input:not(.replace-input)').fill('[');
  await expect(page.locator('.pc-search-feedback')).toContainText('正则表达式无效');
  await expect(page.getByRole('button', { name: '替换全部匹配', exact: true })).toBeDisabled();
  await page.locator('.replace-input').fill('beta'); await page.locator('.replace-input').press('Enter');
  await expect(page.locator('.md-source')).toHaveValue('# Search\n\nalpha alpha');
  await page.locator('.search-bar .search-input:not(.replace-input)').fill('alpha');
  await expect(page.getByRole('button', { name: '替换全部匹配', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '替换全部匹配', exact: true }).click();
  await page.keyboard.press('Escape'); await expect(page.locator('.md-source')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.md-source')).toHaveValue('# Search\n\nalpha alpha');
});

const content = '# 两段阅读\n\n第一段保留自己的疑问。\n\n第二段记录不同的想法。';
async function annotated(page) {
  await page.addInitScript(content => localStorage.setItem('md-editor-warm-v1', JSON.stringify({content, fileName:'批注.md',
    comments:[{id:'one',type:'idea',quote:'第一段',occ:0,note:'疑问一',ts:1}, {id:'two',type:'idea',quote:'第二段',occ:0,note:'疑问二',ts:2}]})), content);
  await openEditor(page); await page.locator('[data-mode="preview"]').click();
  await page.locator('.header-actions button[aria-label="批注"]').click();
}

test('PC paragraph filter follows the clicked reading paragraph without changing annotations', async ({ page }) => {
  await annotated(page);
  await page.locator('.md-preview p').last().click({position:{x:160,y:12}});
  await page.locator('[data-pc-filter="paragraph"]').click();
  await expect(page.locator('.comment-card:visible')).toHaveCount(1);
  await expect(page.locator('.comment-card:visible')).toHaveAttribute('data-card-id','two');
  await page.locator('[data-pc-filter="all"]').click();
  await expect(page.locator('.comment-card:visible')).toHaveCount(2);
  await expect(page.locator('.md-source')).toHaveValue(content);
});

test('PC note and external reply save immediately; closing editor and resizing preserves input', async ({ page }) => {
  await annotated(page);
  await page.locator('[data-card-id="one"] .pc-comment-edit').click();
  const note = page.locator('[data-card-id="one"] .comment-note-input:not(.comment-reply-input)');
  await note.fill('刚写下的疑问，无需保存按钮');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('md-editor-warm-v1')!).comments[0].note)).toBe('刚写下的疑问，无需保存按钮');
  await page.locator('.pc-comment-back').click(); await expect(page.locator('.comment-card:visible')).toHaveCount(2);
  await page.locator('[data-card-id="one"]').getByRole('button',{name:'回复',exact:true}).click();
  await page.locator('.comment-reply-input').fill('从别处找到的回答');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('md-editor-warm-v1')!).comments[0].reply)).toBe('从别处找到的回答');
  await page.keyboard.press('Escape');
  await expect(page.locator('.comment-reply-input')).toHaveCount(0);
  await expect(page.locator('.comment-reply-markdown')).toContainText('从别处找到的回答');
  await page.setViewportSize({width:390,height:844}); await page.setViewportSize({width:1100,height:900});
  await expect(note).toHaveValue('刚写下的疑问，无需保存按钮');
});

test('PC preview search Escape returns to its visible opener', async ({page}) => {
  await openEditor(page); await page.locator('[data-mode="preview"]').click();
  const opener = page.getByRole('button',{name:'查找文档',exact:true}); await opener.click();
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
});

test('PC 900 English: annotation panel does not cover the export control',async({page})=>{
  await page.setViewportSize({width:900,height:1000});
  await page.addInitScript(()=>localStorage.setItem('md-editor-warm-v1',JSON.stringify({locale:'en',content:'# Reading\n\nA long paragraph.',fileName:'A deliberately very long document title.md',comments:[]})));
  await openEditor(page); await page.locator('.header-actions button[data-i18n-aria-label="批注"]').click();
  const exportButton=page.locator('.export-menu-toggle'),panel=page.locator('.comments-panel');
  const buttonBox=(await exportButton.boundingBox())!,panelBox=(await panel.boundingBox())!;
  expect(buttonBox.x+buttonBox.width).toBeLessThanOrEqual(panelBox.x);
  await exportButton.click(); await expect(page.getByRole('menu',{name:'Export',exact:true})).toBeVisible();
});

test('PC Escape dismisses reading selection tools without changing the document',async({page})=>{
  await openEditor(page);await setSource(page,content);await page.locator('[data-mode="preview"]').click();
  await page.locator('.md-preview p').first().evaluate(node=>{
    const range=document.createRange();range.selectNodeContents(node);const selection=window.getSelection()!;
    selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await expect(page.locator('.selection-toolbar')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.selection-toolbar')).toBeHidden();
  await expect(page.locator('.md-source')).toHaveValue(content);
});
