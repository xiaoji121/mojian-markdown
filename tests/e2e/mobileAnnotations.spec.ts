import { test, expect, setSource } from './fixtures';
const source = '# 阅读，让想法留下来\n\n我们读过很多文字，真正留下的，常常只是某个让人停顿的句子。\n\n' + '把停顿，变成自己的话。\n\n'.repeat(30);
async function select(page, text = '常常只是某个让人停顿的句子。') {
 await page.locator('.md-preview').evaluate((el, text) => {
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
  while(n=walker.nextNode()){const at=n.textContent.indexOf(text);if(at<0)continue;const r=document.createRange();r.setStart(n,at);r.setEnd(n,at+text.length);const s=window.getSelection();s.removeAllRanges();s.addRange(r);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));break;}
 }, text);
 await expect(page.locator('.selection-toolbar')).toBeVisible();
}
async function setup(page) {
 await page.setViewportSize({width:390,height:844});await page.goto('/#editor');
 await expect(page.locator('.md-preview h1')).toBeVisible();await setSource(page,source);
 await page.locator('.view-mode-option[data-mode="preview"]').click();
 await expect.poll(async()=>JSON.parse(await page.evaluate(()=>localStorage.getItem('md-editor-warm-v1'))||'{}').content).toBe(source);
}
test('mobile new idea stays a draft until Save, discard preserves source and saved annotations', async({page})=>{
 await setup(page);await select(page);await page.locator('[data-sel-annotate="idea"]').click();
 await expect(page.locator('[data-mobile-note]')).toBeVisible();await page.locator('[data-mobile-note]').fill('我的草稿');
 expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('md-editor-warm-v1'))).comments).toHaveLength(0);
 await page.keyboard.press('Escape');await expect(page.locator('[data-mobile-confirm="discard"]')).toBeVisible();
 await page.locator('[data-mobile-continue]').click();await expect(page.locator('[data-mobile-note]')).toHaveValue('我的草稿');
 await page.locator('[data-mobile-save]').click();await expect(page.locator('.mobile-annotation-card')).toHaveCount(1);
 await page.locator('[data-mobile-edit]').click();await page.locator('[data-mobile-note]').fill('放弃的修改');await page.keyboard.press('Escape');await page.locator('[data-mobile-confirm="discard"]').click();
 await expect(page.locator('.mobile-annotation-card')).toContainText('我的草稿');await expect(page.locator('.md-source')).toHaveValue(source);
 page.once('dialog',d=>d.accept());await page.reload();await expect(page.locator('.editor-main')).toHaveClass(/preview-mode-active/);await page.locator('.mobile-reading-nav button').nth(1).click();await expect(page.locator('.mobile-annotation-card')).toContainText('我的草稿');
});
test('mobile interrupted draft restores, reply saves explicitly, delete confirms',async({page})=>{
 await setup(page);await select(page);await page.locator('[data-sel-annotate="idea"]').click();await page.locator('[data-mobile-note]').fill('恢复我的想法');
 page.once('dialog',d=>d.accept());await page.reload();await expect(page.locator('.editor-main')).toHaveClass(/preview-mode-active/);await page.locator('.mobile-reading-nav button').nth(1).click();await page.locator('[data-mobile-resume]').click();await expect(page.locator('[data-mobile-note]')).toHaveValue('恢复我的想法');
 await page.locator('[data-mobile-save]').click();await page.locator('[data-mobile-edit]').click();await page.locator('[data-mobile-reply]').fill('外部回答');await page.locator('[data-mobile-save]').click();
 await page.locator('.mobile-annotation-card-more summary').click();await page.locator('[data-mobile-delete]').click();await page.locator('[data-mobile-continue]').click();await expect(page.locator('.mobile-annotation-card')).toHaveCount(1);
 await page.locator('.mobile-annotation-card-more summary').click();await page.locator('[data-mobile-delete]').click();await page.locator('[data-mobile-confirm="delete"]').click();await expect(page.locator('.mobile-annotation-empty')).toBeVisible();
 await expect(page.locator('.md-source')).toHaveValue(source);
});
for (const width of [360,390,719,720,721,759,760]) test(`mobile markers and sheet focus preserve text at ${width}`,async({page})=>{
 await setup(page);await page.setViewportSize({width,height:844});
 for(const type of ['marker','wavy','straight']){await select(page);await page.locator(`[data-sel-annotate="${type}"]`).click();await expect(page.locator('.selection-toolbar')).toBeHidden();}
 await page.locator('.md-preview').evaluate(el=>el.scrollTop=250);const scroll=await page.locator('.md-preview').evaluate(el=>el.scrollTop);
 await page.locator('.mobile-reading-nav button').nth(1).click();await expect(page.locator('.mobile-annotation-card')).toHaveCount(3);
 await page.keyboard.press('Shift+Tab');await expect(page.locator('.mobile-annotation-sheet').getByRole('button',{name:'复制全部批注',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');expect(await page.locator('.md-preview').evaluate(el=>el.scrollTop)).toBe(scroll);await expect(page.locator('.md-source')).toHaveValue(source);
});
test('resize dirty edit requires decision; discard retains committed value and PC autosaves',async({page})=>{
 await setup(page);await select(page);await page.locator('[data-sel-annotate="marker"]').click();await page.locator('.mobile-reading-nav button').nth(1).click();await page.locator('[data-mobile-edit]').click();await page.locator('[data-mobile-note]').fill('未提交');
 await page.setViewportSize({width:761,height:844});await expect(page.locator('[data-mobile-confirm="discard"]')).toBeVisible();await page.locator('[data-mobile-continue]').click();await expect(page.locator('[data-mobile-note]')).toHaveValue('未提交');
 await page.keyboard.press('Escape');await page.locator('[data-mobile-confirm="discard"]').click();await expect(page.locator('.mobile-annotation-overlay')).toBeHidden();
 await page.getByRole('button',{name:'批注',exact:true}).first().click();await page.locator('.comment-note-input').fill('PC 自动保存');await expect.poll(async()=>JSON.parse(await page.evaluate(()=>localStorage.getItem('md-editor-warm-v1'))).comments[0].note).toBe('PC 自动保存');
});
test('copy failure keeps selectable text and scopes; storage failure retains editable draft',async({page})=>{
 await setup(page);await select(page);await page.locator('[data-sel-annotate="idea"]').click();await page.locator('[data-mobile-note]').fill('保存保护');
 await page.evaluate(()=>{const native=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='md-editor-warm-v1')throw Error('test denial');return native.call(this,k,v);};});
 await page.locator('[data-mobile-save]').click();await expect(page.locator('.mobile-annotation-error')).toContainText('保存失败');await expect(page.locator('[data-mobile-note]')).toHaveValue('保存保护');
 // Reload resets the deliberate storage stub and restores the session draft.
 page.once('dialog',d=>d.accept());await page.reload();await expect(page.locator('.editor-main')).toHaveClass(/preview-mode-active/);await page.locator('.mobile-reading-nav button').nth(1).click();await page.locator('[data-mobile-resume]').click();await page.locator('[data-mobile-save]').click();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied');}}}));
 await page.locator('.mobile-annotation-card-more summary').click();await page.locator('.mobile-annotation-card-more').getByRole('button',{name:'复制',exact:true}).click();await expect(page.locator('.mobile-annotation-sheet [role="status"]')).toContainText('未能写入');await expect(page.locator('.mobile-annotation-copy-text')).toHaveValue(/保存保护/);
 await page.getByRole('button',{name:'复制完整内容',exact:true}).click();await expect(page.locator('.mobile-annotation-copy-text')).toHaveValue(new RegExp('阅读，让想法留下来'));
 await page.getByRole('button',{name:'手动复制',exact:true}).click();await expect(page.locator('.mobile-annotation-copy-text')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('.mobile-annotation-card')).toHaveCount(1);
});
for(const locale of ['zh-CN','zh-TW','en','ja'])test(`mobile annotation form localized and fits ${locale}`,async({browser})=>{
 const context=await browser.newContext({baseURL:'http://localhost:4650',viewport:{width:360,height:640},locale});const page=await context.newPage();await page.route(u=>!['localhost','127.0.0.1'].includes(u.hostname),r=>r.abort());await setup(page);await page.setViewportSize({width:360,height:640});await select(page);await page.locator('[data-sel-annotate="idea"]').click();await page.locator('[data-mobile-note]').fill('長文'.repeat(200));await expect(page.locator('[data-mobile-save]')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.locator('[data-mobile-close]').click();await expect(page.locator('[data-mobile-confirm="discard"]')).toBeVisible();await page.locator('[data-mobile-continue]').click();await expect(page.locator('[data-mobile-note]')).toHaveValue('長文'.repeat(200));await page.locator('[data-mobile-save]').click();await context.close();
});
test('selection more restores selection; excerpt downloads PNG without changing export preferences',async({page})=>{
 await setup(page);await select(page);const selection=await page.evaluate(()=>window.getSelection().toString());await page.locator('.seltool-more').click();await page.locator('[data-mobile-close]').click();await expect.poll(()=>page.evaluate(()=>window.getSelection().toString())).toBe(selection);
 await select(page);await page.locator('.seltool-more').click();await page.getByRole('button',{name:'生成图片',exact:true}).click();await expect(page.locator('.longimg-modal-title')).toHaveText('摘录图片预览');await expect(page.locator('.longimg-mark-toggle')).toBeHidden();
 const download=page.waitForEvent('download');await page.locator('.longimg-save').click();expect((await download).suggestedFilename()).toMatch(/\.png$/);await expect(page.locator('.md-source')).toHaveValue(source);await expect(page.locator('.longimg-overlay')).toBeHidden();
});
test('swipe header and backdrop ask before discarding, clean new draft closes without creating annotation',async({page})=>{
 await setup(page);await select(page);await page.locator('[data-sel-annotate="idea"]').click();await page.locator('[data-mobile-close]').click();await expect(page.locator('.mobile-annotation-overlay')).toBeHidden();
 await select(page);await page.locator('[data-sel-annotate="idea"]').click();await page.locator('[data-mobile-note]').fill('拖动也不能丢失');
 const head=page.locator('.mobile-annotation-sheet header');const box=await head.boundingBox();await page.mouse.move(box.x+40,box.y+12);await page.mouse.down();await page.mouse.move(box.x+40,box.y+100,{steps:5});await page.mouse.up();await expect(page.locator('[data-mobile-confirm="discard"]')).toBeVisible();await page.locator('.mobile-annotation-backdrop').click({position:{x:3,y:3}});await expect(page.locator('[data-mobile-note]')).toHaveValue('拖动也不能丢失');await page.locator('[data-mobile-close]').click();await page.locator('[data-mobile-confirm="discard"]').click();await expect(page.locator('.mobile-annotation-overlay')).toBeHidden();
});
