import { test, expect, openEditor, setSource } from './fixtures';

const longText = '# 阅读，让想法留下来\n\n' + Array.from({length:40},(_,i)=>`## 第 ${i+1} 段\n\n不必立刻正确，先保留当下的理解。`).join('\n\n');
for (const width of [900,1100,1440]) {
  test(`PC ${width}: collapse reflows, keyboard reopen, modes and caret retained`, async ({page})=>{
    await page.setViewportSize({width,height:1000});await openEditor(page);await setSource(page,longText);
    const source=page.locator('.md-source');await source.evaluate((e:HTMLTextAreaElement)=>e.setSelectionRange(35,42));
    const shell=page.locator('.editor-main');const before=(await shell.boundingBox())!;
    const close=page.locator('.document-sidebar-close');await close.focus();await page.keyboard.press('Enter');
    const reopen=page.locator('.document-toggle');await expect(reopen).toBeFocused();await expect(page.locator('.document-sidebar')).toBeHidden();
    expect((await shell.boundingBox())!.width).toBeGreaterThan(before.width+190);
    await expect(page.locator('.pc-sidebar-toggle-label')).toBeVisible();
    await page.locator('[data-mode="editor"]').click();await expect(page.locator('.document-sidebar')).toBeHidden();
    expect(await source.evaluate((e:HTMLTextAreaElement)=>[e.selectionStart,e.selectionEnd])).toEqual([35,42]);
    await page.locator('[data-mode="preview"]').click();await expect(page.locator('.document-sidebar')).toBeHidden();
    await page.locator('[data-mode="split"]').click();await expect(source).toHaveValue(longText);
    await reopen.focus();await page.keyboard.press('Enter');await expect(close).toBeFocused();await expect(page.locator('.document-sidebar')).toBeVisible();
    expect(await source.evaluate((e:HTMLTextAreaElement)=>[e.selectionStart,e.selectionEnd])).toEqual([35,42]);
    expect((await page.locator('.app-header').boundingBox())!.height).toBe(56);
    expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth)).toBe(true);
  });
  test(`PC ${width}: focus restores collapsed sidebar, reading position and outline`, async ({page})=>{
    await page.setViewportSize({width,height:1000});await openEditor(page);await setSource(page,longText);
    await page.locator('[data-mode="preview"]').click();await page.locator('.header-actions button[aria-label="大纲"]').click();
    await expect(page.locator('.outline-panel')).toBeVisible();await page.locator('.document-sidebar-close').click();
    const preview=page.locator('.md-preview');await preview.evaluate(e=>{e.scrollTop=420;});await expect(page.locator('.reading-toolbar')).toHaveClass(/is-scrolled-away/);
    await page.keyboard.press('Escape'); // no document mutation; toolbar revealed by scroll direction
    await preview.evaluate(e=>{e.scrollTop=400;});await expect(page.locator('.reading-toolbar')).not.toHaveClass(/is-scrolled-away/);
    await page.getByRole('button',{name:'沉浸式阅读',exact:true}).click();await expect(page.locator('.outline-panel')).toBeHidden();
    await page.keyboard.press('Escape');await expect(page.locator('.outline-panel')).toBeVisible();await expect(page.locator('.document-sidebar')).toBeHidden();
    expect(await preview.evaluate(e=>e.scrollTop)).toBe(400);
    await expect(page.locator('.document-toggle')).toBeVisible();await expect(page.locator('.md-source')).toHaveValue(longText);
  });
}

test('desktop expanded preference survives mobile drawer use, hidden focus moves to visible opener',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await openEditor(page);
  await page.locator('.document-sidebar-close').focus();await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.document-toggle')).toBeFocused();await page.locator('.document-toggle').click();
  await expect(page.locator('.document-sidebar')).toBeVisible();await page.locator('.document-sidebar-close').click();
  await page.setViewportSize({width:1440,height:1000});await expect(page.locator('.document-sidebar')).toBeVisible();
  await page.locator('.document-sidebar-close').click();await page.setViewportSize({width:390,height:844});
  await page.locator('.document-toggle').click();await page.locator('.document-sidebar-close').click();
  await page.setViewportSize({width:900,height:1000});await expect(page.locator('.document-sidebar')).toBeHidden();await expect(page.locator('.document-toggle')).toBeVisible();
});

test('collapsed navigation keeps settings discoverable in source mode and across breakpoint',async({page})=>{
  await page.setViewportSize({width:1100,height:1000});await openEditor(page);await page.locator('[data-mode="editor"]').click();
  await page.locator('.document-sidebar-close').click();const settings=page.locator('.pc-header-settings');await expect(settings).toBeVisible();
  await settings.click();await page.locator('[data-pc-preference="font"]').click();
  const dialog=page.getByRole('dialog',{name:'设置',exact:true});await expect(dialog).toBeVisible();
  await page.setViewportSize({width:390,height:844});await expect(dialog).toBeHidden();await expect(page.locator('.mobile-menu-toggle:visible')).toBeFocused();
  await page.setViewportSize({width:1100,height:1000});await expect(page.locator('.document-sidebar')).toBeHidden();
  await settings.click();await page.keyboard.press('Escape');await expect(settings).toBeFocused();
});

test('centered desktop action family uses SVG icons; settings and file capabilities remain',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await openEditor(page);
  const metrics=await page.locator('.workspace-file-actions>.abtn').evaluateAll(buttons=>buttons.filter(b=>!b.matches('.mobile-document-rename')).map(b=>{const r=b.getBoundingClientRect(),s=b.querySelector('svg:not(.mobile-only)')?.getBoundingClientRect(),t=b.querySelector('span[data-i18n],.open-doc-label')?.getBoundingClientRect();return{s:!!s,delta:s&&t?((Math.min(s.left,t.left)+Math.max(s.right,t.right))/2-(r.left+r.right)/2):999};}));
  expect(metrics).toHaveLength(2);for(const m of metrics){expect(m.s).toBe(true);expect(Math.abs(m.delta)).toBeLessThan(1);}
  await page.getByRole('button',{name:'导出',exact:true}).click();await expect(page.getByRole('menuitem',{name:'另存为…',exact:true})).toBeVisible();
});

test('quick desktop mode switch does not steal keyboard focus from the export menu',async({page})=>{
  await openEditor(page);
  await page.evaluate(()=>{
    (document.querySelector('[data-mode="split"]') as HTMLButtonElement).click();
    const button=document.querySelector('.export-menu-toggle') as HTMLButtonElement;
    button.focus();button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  });
  await expect(page.getByRole('menuitem',{name:'下载全文+批注备份包'})).toBeFocused();
});

for(const width of [900,1100,1440])test(`PC ${width}: expanded navigation and instant notes survive focus and mobile resize`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await page.addInitScript(content=>localStorage.setItem('md-editor-warm-v1',JSON.stringify({content,fileName:'Phase1 sample.md',comments:[{id:'phase1-note',type:'idea',quote:'不必立刻正确',occ:0,note:'原想法',ts:1}]})),longText);
  await openEditor(page);await page.locator('[data-mode="preview"]').click();
  await page.locator('.header-actions button[aria-label="批注"]').click();
  const panel=page.locator('.comments-panel');await expect(panel).toBeVisible();
  const note=panel.locator('.comment-note-input');await note.fill('PC逐字保存仍然保留');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('md-editor-warm-v1')||'{}').comments?.[0]?.note)).toBe('PC逐字保存仍然保留');
  await page.getByRole('button',{name:'沉浸式阅读',exact:true}).click();await expect(panel).toBeHidden();
  await page.keyboard.press('Escape');await expect(panel).toBeVisible();await expect(page.locator('.document-sidebar')).toBeVisible();
  await page.locator('.document-sidebar-close').click();await expect(panel).toBeVisible();
  await page.setViewportSize({width:390,height:844});await page.setViewportSize({width,height:1000});
  await expect(page.locator('.document-sidebar')).toBeHidden();await expect(panel).toBeVisible();
  await expect(note).toHaveValue('PC逐字保存仍然保留');await expect(page.locator('.md-source')).toHaveValue(longText);
});
