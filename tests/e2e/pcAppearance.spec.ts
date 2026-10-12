import { test, expect, openEditor } from './fixtures';
const content = '# 保留文稿\n\n' + Array.from({length:30}, (_,i)=>`## 第 ${i} 节\n\n阅读与思考，保持原来的文字和批注。`).join('\n\n');
async function seed(page, values = {}) {
  await page.addInitScript(state => { if (!localStorage.getItem('md-editor-warm-v1')) localStorage.setItem('md-editor-warm-v1',JSON.stringify(state)); }, {
    content, fileName:'外观验证.md', comments:[{id:'keep',type:'idea',quote:'阅读与思考',note:'保留想法',occ:0,ts:1}],
    theme:'dark', paperDark:'snow', paperLight:'cream', fontSize:20, readingFont:'local-jinkai', ...values });
}
async function settings(page, section) {
  await page.locator('.pc-header-settings').click();
  await page.locator(`[data-pc-preference="${section}"]`).click();
  await expect(page.locator('.workspace-settings')).toBeVisible();
}

test('global menu starts closed and the font sample uses the selected local face',async({page})=>{
  await seed(page);await openEditor(page);await expect(page.locator('.pc-global-menu')).toBeHidden();
  await settings(page,'font');
  const fonts=await page.evaluate(()=>['.reading-font-preview','.md-preview'].map(s=>getComputedStyle(document.querySelector(s)!).fontFamily));
  expect(fonts[0]).toBe(fonts[1]);
});

for(const width of [900,1100,1440]) test(`PC ${width}: global menu and settings preserve scroll, focus and content`,async({page})=>{
  await page.setViewportSize({width,height:1000});await seed(page);await openEditor(page);
  await page.locator('[data-mode="preview"]').click();
  await page.locator('.md-preview').evaluate(e=>e.scrollTop=420);
  await expect(page.locator('.reading-toolbar')).toHaveClass(/is-scrolled-away/);
  const top=await page.locator('.md-preview').evaluate(e=>e.scrollTop);
  await settings(page,'paper');
  await expect(page.locator('.pc-soften-input')).not.toBeChecked();
  await page.locator('.pc-soften-input').check();
  await page.keyboard.press('Escape');await expect(page.locator('.pc-header-settings')).toBeFocused();
  expect(await page.locator('.md-preview').evaluate(e=>e.scrollTop)).toBe(top);
  await expect(page.locator('.md-preview')).toHaveCSS('background-color','rgb(45, 46, 44)');
  await expect(page.locator('.md-source')).toHaveValue(content);
  await settings(page,'font');await expect(page.locator('.reading-font-select')).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(page.locator('.workspace-settings')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth)).toBe(true);
  expect((await page.locator('.app-header').boundingBox())!.height).toBe(56);
});

test('five paper colors, softening toggle, theme-specific choices and refresh preserve explicit settings',async({page})=>{
  await seed(page);await openEditor(page);await page.locator('[data-mode="preview"]').click();await settings(page,'paper');
  await page.locator('.pc-soften-input').check();
  const colors={snow:'rgb(45, 46, 44)',parchment:'rgb(59, 48, 36)',cream:'rgb(52, 51, 41)',green:'rgb(40, 55, 47)',ink:'rgb(28, 26, 23)'};
  for(const [paper,color] of Object.entries(colors)){
    await page.locator(`.paper-picker .paper-dot[data-paper="${paper}"]`).click();
    await expect(page.locator('.md-preview')).toHaveCSS('background-color',color);
  }
  await page.locator('.paper-dot[data-paper="green"]').click();await page.locator('.pc-soften-input').uncheck();
  await expect(page.locator('.md-preview')).toHaveCSS('background-color','rgb(192, 237, 198)');
  await page.locator('.appearance-theme').click();await expect(page.locator('body')).toHaveAttribute('data-paper','cream');
  await page.locator('.appearance-theme').click();await expect(page.locator('body')).toHaveAttribute('data-paper','green');
  await page.keyboard.press('Escape');await page.reload();await settings(page,'paper');
  await expect(page.locator('.pc-soften-input')).not.toBeChecked();
  await expect(page.locator('body')).toHaveAttribute('data-paper','green');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('md-editor-warm-v1')!).comments[0].note)).toBe('保留想法');
});

for(const locale of ['zh-CN','zh-TW','en','ja'])test(`PC settings ${locale}: long labels fit and language persists`,async({page})=>{
  await page.setViewportSize({width:900,height:1000});await seed(page,{locale});await openEditor(page);
  await settings(page,'font');await expect(page.locator('.pc-font-status')).not.toBeEmpty();
  expect(await page.locator('.workspace-settings').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');await settings(page,'language');
  const target=locale==='en'?'ja':'en';await page.locator(`.interface-language-option[data-locale="${target}"]`).click();
  await page.keyboard.press('Escape');await page.reload();await expect(page.locator('html')).toHaveAttribute('lang',target);
  await expect(page.locator('.md-source')).toHaveValue(content);
});

test('missing local font is stated near the choice; saved choice and article are retained',async({page})=>{
  await page.addInitScript(()=>{const load=FontFace.prototype.load;FontFace.prototype.load=function(){return this.family.includes('JinKai')?Promise.reject(new Error('test font unavailable')):load.call(this);};});
  await seed(page);await openEditor(page);await settings(page,'font');
  await expect(page.locator('.pc-font-status')).toContainText('后备');
  await expect(page.locator('.reading-font-select')).toHaveValue('local-jinkai');
  await expect(page.locator('.md-source')).toHaveValue(content);
});

test('unavailable font detection does not claim that it is still loading',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'FontFace',{value:undefined});});
  await seed(page);await openEditor(page);await settings(page,'font');
  await expect(page.locator('.pc-font-status')).toContainText('无法检测');
  await expect(page.locator('.reading-font-select')).toHaveValue('local-jinkai');
});

test('menu keyboard navigation, modal focus trap and mobile return keep preference and content',async({page})=>{
  await seed(page,{softenDarkPaper:true});await openEditor(page);
  await page.locator('.pc-header-settings').focus();await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-pc-preference="font"]')).toBeFocused();
  await page.keyboard.press('End');await expect(page.locator('[data-pc-preference="integrations"]')).toBeFocused();
  await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  const close=page.locator('.pc-settings-footer .abtn');await close.focus();await page.keyboard.press('Tab');
  await expect(page.locator('.appearance-close')).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(close).toBeFocused();
  await page.setViewportSize({width:390,height:844});await expect(page.locator('.workspace-settings')).toBeHidden();
  await expect(page.locator('.md-preview')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await page.setViewportSize({width:1100,height:1000});await expect(page.locator('.md-preview')).toHaveCSS('background-color','rgb(45, 46, 44)');
  await settings(page,'paper');await expect(page.locator('.pc-soften-input')).toBeChecked();
  await page.keyboard.press('Escape');await expect(page.locator('.md-source')).toHaveValue(content);
});

test('softened desktop paper exports the original paper and preserves typography',async({page})=>{
  await seed(page,{softenDarkPaper:true,paperDark:'green'});await openEditor(page);
  await expect(page.locator('.md-preview')).toHaveCSS('background-color','rgb(40, 55, 47)');
  await page.getByRole('button',{name:'导出',exact:true}).click();
  await page.getByRole('menuitem',{name:'导出长图',exact:true}).click();
  await expect(page.locator('.longimg-poster')).toBeVisible();
  await expect(page.locator('.longimg-poster')).toHaveCSS('background-color','rgb(192, 237, 198)');
  const typography=await page.evaluate(()=>['.md-preview','.longimg-poster'].map(s=>{
    const style=getComputedStyle(document.querySelector(s)!);return [style.fontFamily,style.getPropertyValue('--paper-line-height')];
  }));expect(typography[0]).toEqual(typography[1]);
});
