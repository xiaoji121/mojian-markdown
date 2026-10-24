import {test,expect,openEditor,setSource,disableWebRecent} from './fixtures';
test.use({viewport:{width:390,height:844}});
test('mobile formatting keeps selection and provides source replacement with disabled empty results',async({page})=>{
 await openEditor(page);await setSource(page,'# 阅读\n\n阅读两次');
 await page.locator('.md-source').evaluate((e:HTMLTextAreaElement)=>{e.focus();e.setSelectionRange(2,4);});
 await page.locator('[data-mobile-format-more]').click();await page.locator('[data-mobile-format="bold"]').click();
 await expect(page.locator('.md-source')).toHaveValue('# **阅读**\n\n阅读两次');
 await page.locator('[data-mobile-format-more]').click();await page.locator('[data-mobile-source-find]').click();
 await page.locator('.search-bar .search-input:not(.replace-input)').fill('不存在');
 await expect(page.locator('.search-replace-btn').first()).toBeDisabled();
 await expect(page.locator('.mobile-search-preview')).toContainText('当前源文未改变');
 await page.locator('.search-bar .search-input:not(.replace-input)').fill('阅读');await page.locator('.replace-input').fill('阅览');
 await page.locator('.search-replace-btn').last().click();await expect(page.locator('.md-source')).toHaveValue('# **阅览**\n\n阅览两次');
 await page.locator('.search-bar .search-close').click();await page.locator('[data-mobile-edit-done]').click();await expect(page.locator('.md-preview')).toBeVisible();
});
test('without browser recent storage, new and failed import preserve source and annotations until explicit confirmation',async({page})=>{
 await disableWebRecent(page);await openEditor(page);await setSource(page,'# 保留当前稿');await page.locator('[data-mobile-edit-done]').click();
 await page.locator('.document-toggle').first().click();await page.getByRole('button',{name:'新建文档',exact:true}).click();
 await expect(page.locator('.mobile-file-sheet')).toContainText('先留一份备份');await page.locator('[data-mobile-file-cancel]').last().click();
 await expect(page.locator('.md-source')).toHaveValue('# 保留当前稿');
 await page.locator('.document-toggle').first().click();await page.locator('.open-doc-btn').click();
 await page.evaluate(()=>{File.prototype.text=async()=>{throw Error('synthetic read denied');};});
 const chooser=page.waitForEvent('filechooser');await page.locator('[data-mobile-file-pick]').click();
 await (await chooser).setFiles({name:'note.md',mimeType:'text/markdown',buffer:Buffer.from('# 新稿')});
 await expect(page.locator('.mobile-file-sheet')).toContainText('文件读取失败');await expect(page.locator('.md-source')).toHaveValue('# 保留当前稿');
});
for(const width of [360,390,719,720,721,759,760])test(`editing controls and keyboard height at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:480});await openEditor(page);await page.locator('.view-mode-option[data-mode="editor"]').click();
 await setSource(page,'# 标题\n\n正文');
 for(const selector of ['[data-mobile-edit-done]','[data-mobile-format-more]']){const r=await page.locator(selector).boundingBox();expect(r).not.toBeNull();expect(r!.height).toBeGreaterThanOrEqual(44);expect(r!.y+r!.height).toBeLessThanOrEqual(480);}
 await page.locator('[data-mobile-format-more]').click();await page.keyboard.press('Escape');await expect(page.locator('.mobile-file-overlay')).toBeHidden();await expect(page.locator('.md-source')).toHaveValue('# 标题\n\n正文');
});
for(const locale of ['zh-CN','zh-TW','en','ja'])test(`localized source search, regex and rename ${locale}`,async({page})=>{
 await page.addInitScript(locale=>localStorage.setItem('md-editor-warm-v1',JSON.stringify({locale,content:'# sample\n\nsample',fileName:'sample.md',comments:[]})),locale);
 await page.goto('/#editor');await page.locator('.view-mode-option[data-mode="editor"]').click();
 await page.locator('[data-mobile-format-more]').click();await page.locator('[data-mobile-source-find]').click();
 await page.locator('.search-bar .search-input').first().fill('[');await page.locator('.search-opt').last().click();
 await expect(page.locator('.search-replace-btn').last()).toBeDisabled();await page.locator('.search-bar .search-close').click();
 await page.locator('[data-mobile-edit-done]').click();await page.locator('.document-toggle').first().click();await page.locator('[data-mobile-rename]').click();
 await page.locator('.mobile-file-sheet input').fill('renamed');await page.locator('[data-mobile-file-rename]').click();await expect(page.locator('.file-name').first()).toHaveText('renamed.md');
 await expect(page.locator('.md-source')).toHaveValue('# sample\n\nsample');await page.reload();await expect(page.locator('.md-source')).toHaveValue('# sample\n\nsample');
});
test('without browser recent storage, import cancellation and quota failure preserve annotations, source and undo history',async({page})=>{
 await disableWebRecent(page);await page.addInitScript(()=>localStorage.setItem('md-editor-warm-v1',JSON.stringify({content:'# keep',fileName:'keep.md',comments:[{id:'mark1',type:'marker',quote:'keep',note:'kept',reply:''}]})));
 await page.goto('/#editor');await page.locator('.view-mode-option[data-mode="editor"]').click();await page.locator('.md-source').fill('# keep changed');
 await page.locator('[data-mobile-edit-done]').click();await page.locator('.document-toggle').first().click();await page.locator('.open-doc-btn').click();
 let chooser=page.waitForEvent('filechooser');await page.locator('[data-mobile-file-pick]').click();await(await chooser).setFiles({name:'new.md',mimeType:'text/markdown',buffer:Buffer.from('# new')});
 await expect(page.locator('[data-mobile-file-confirm]')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.md-source')).toHaveValue('# keep changed');
 await page.locator('.document-toggle').first().click();await page.locator('.open-doc-btn').click();
 chooser=page.waitForEvent('filechooser');await page.locator('[data-mobile-file-pick]').click();await(await chooser).setFiles({name:'new.md',mimeType:'text/markdown',buffer:Buffer.from('# new')});
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError');};});await page.locator('[data-mobile-file-confirm]').click();
 await expect(page.locator('.mobile-file-sheet')).toContainText('草稿保存失败');await expect(page.locator('.md-source')).toHaveValue('# keep changed');
 await expect(page.locator('.file-name').first()).toHaveText('keep.md');await page.keyboard.press('Escape');
 await page.locator('.mobile-reading-nav button').last().click();await page.locator('.view-mode-option[data-mode="editor"]').click();await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.md-source')).toHaveValue('# keep');
});
test('backup starts a real download, retains draft and repeated clicks are serialized',async({page})=>{
 await openEditor(page);await setSource(page,'# backup');await page.locator('[data-mobile-edit-done]').click();
 await page.locator('.mobile-menu-toggle').first().click();await page.locator('[data-mobile-action="export"]').click();
 const download=page.waitForEvent('download');await page.locator('.mobile-export-primary button').filter({hasText:'备份'}).click();
 expect((await download).suggestedFilename()).toMatch(/\.zip$/);await expect(page.locator('.mobile-file-sheet')).toContainText('已发起下载');await expect(page.locator('.md-source')).toHaveValue('# backup');
 await page.keyboard.press('Escape');await page.reload();await expect(page.locator('.md-source')).toHaveValue('# backup');
});
test('a recovered unsaved annotation blocks document replacement',async({page})=>{
 await openEditor(page);await setSource(page,'# keep draft');
 await page.evaluate(()=>{const source=(document.querySelector('.md-source') as HTMLTextAreaElement).value;let hash=2166136261;for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),16777619);const name=document.querySelector('.file-name')!.textContent;sessionStorage.setItem('mojian-mobile-annotation-draft-v1',JSON.stringify({documentKey:[name,'',source.length,hash>>>0].join(':'),isNew:true,original:{quote:'keep',note:'',reply:''},note:'unsaved',reply:''}));});
 await page.locator('[data-mobile-edit-done]').click();await page.locator('.document-toggle').first().click();await page.getByRole('button',{name:'新建文档',exact:true}).click();
 await expect(page.locator('[data-mobile-file-confirm]')).toHaveCount(0);await expect(page.locator('.mobile-file-sheet')).toContainText('未保存的批注草稿');
 await page.keyboard.press('Escape');await expect(page.locator('.md-source')).toHaveValue('# keep draft');
});
test('paged image failure keeps settings and source; retry downloads only after all pages succeed',async({page})=>{
 await openEditor(page);const content='# 图片\n\n'+('## 阅读\n\n保留当前正文与批注。\n\n'.repeat(14));await setSource(page,content);await page.locator('[data-mobile-edit-done]').click();
 await page.locator('.mobile-menu-toggle').first().click();await page.locator('[data-mobile-action="export"]').click();await page.locator('.mobile-export-primary button').filter({hasText:'长图'}).click();
 await page.locator('[data-longimg-width="phone"]').click();await page.locator('.longimg-crop-toggle').click();await expect(page.locator('.longimg-save')).toBeEnabled();
 await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toBlob;let calls=0;HTMLCanvasElement.prototype.toBlob=function(callback,...args){if(++calls===2)callback(null);else original.call(this,callback,...args);};});
 const downloads:string[]=[];page.on('download',d=>downloads.push(d.suggestedFilename()));await page.locator('.longimg-save').click();
 await expect(page.locator('.mobile-image-progress')).toContainText('生成失败');expect(downloads).toHaveLength(0);await expect(page.locator('.md-source')).toHaveValue(content);
 await expect(page.locator('.longimg-crop-toggle')).toHaveAttribute('aria-pressed','true');
 const download=page.waitForEvent('download');await page.locator('.longimg-save').click();expect((await download).suggestedFilename()).toMatch(/\.zip$/);await expect(page.locator('.mobile-file-sheet')).toContainText('已发起下载');
});
test('resize dismisses mobile format overlay without changing caret or source',async({page})=>{
 await openEditor(page);await setSource(page,'# caret\n\nsource');await page.locator('.md-source').evaluate((e:HTMLTextAreaElement)=>{e.focus();e.setSelectionRange(3,5);});
 await page.locator('[data-mobile-format-more]').click();await page.setViewportSize({width:761,height:900});await expect(page.locator('.mobile-file-overlay')).toBeHidden();await expect(page.locator('.md-source')).toHaveValue('# caret\n\nsource');
 expect(await page.locator('.md-source').evaluate((e:HTMLTextAreaElement)=>[e.selectionStart,e.selectionEnd])).toEqual([3,5]);
});
