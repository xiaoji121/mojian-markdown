import { test, expect, openMobileSetting } from './fixtures';

test('D01 uses simple rows and preserves source, scroll and close focus', async ({page}) => {
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#editor');
 await expect(page.locator('.md-preview h1').first()).toBeVisible();
 const source = await page.locator('.md-source').inputValue();
 await page.locator('.md-preview').evaluate(el => el.scrollTop=120);
 const scroll = await page.locator('.md-preview').evaluate(el=>el.scrollTop);
 const opener=page.locator('.app-header .mobile-menu-toggle');
 await opener.click(); await page.locator('[data-mobile-action="settings"]').click();
 await expect(page.locator('.mobile-settings-home')).toBeVisible();
 await expect(page.locator('.mobile-settings-home [data-mobile-setting]')).toHaveCount(5);
 await expect(page.locator('.workspace-settings-nav')).toBeHidden();
 await page.locator('[data-mobile-setting="font"]').click();
 await expect(page.locator('.reading-font-select')).toBeVisible();
 await page.locator('.reading-font-select').selectOption('system-serif');
 await expect(page.locator('body')).toHaveAttribute('data-reading-font','system-serif');
 await page.locator('.mobile-settings-back').click();
 await expect(page.locator('[data-mobile-setting="font"]')).toBeFocused();
 await expect(page.locator('.mobile-settings-font-value')).toContainText('系统衬线');
 const adjustedScroll = await page.locator('.md-preview').evaluate(el=>el.scrollTop);
 await page.locator('.mobile-settings-done').click();
 await expect(opener).toBeFocused();
 await expect(page.locator('.md-source')).toHaveValue(source);
 expect(await page.locator('.md-preview').evaluate(el=>el.scrollTop)).toBe(adjustedScroll);
 expect(adjustedScroll).toBeGreaterThan(0);
});

for (const locale of ['zh-CN','zh-TW','en','ja']) for (const theme of ['light','dark']) {
 test(`integrated settings retain data and preferences in ${locale} ${theme}`, async ({page}) => {
  await page.setViewportSize({width:360,height:480});
  const content='# Reading 阅读 閱讀 読む\n\nA sample paragraph. 中文阅读。日本語の文章。\n\n'+ 'More text.\n\n'.repeat(30);
  await page.addInitScript(({locale,theme,content})=>{if(!localStorage.getItem('md-editor-warm-v1'))localStorage.setItem('md-editor-warm-v1',JSON.stringify({locale,theme,content,fileName:'sample.md',comments:[],readingFont:'source-serif-4'}));},{locale,theme,content});
  await page.goto('/#editor'); await expect(page.locator('.md-preview h1')).toBeVisible();
  await page.locator('[data-mode="preview"]').click();
  await page.keyboard.press('Control+,');
  const panel=page.locator('.workspace-settings');
  await expect(page.locator('.mobile-settings-home')).toBeVisible();
  await openMobileSetting(page,'font');
  await page.locator('.reading-font-select').selectOption('local-jinkai');
  await expect(page.locator('.reading-font-status')).not.toBeEmpty();
  await expect(page.locator('.reading-font-note')).toBeVisible();
  await expect(page.locator('.reading-font-import')).toBeHidden();
  await page.locator('.reading-font-select').selectOption('system-serif');
  await openMobileSetting(page,'paper');
  await page.locator('.font-inc').click();
  for (const paper of ['parchment','cream','snow','green','ink']) {
   await page.locator(`.paper-dot[data-paper="${paper}"]`).click();
   await expect(page.locator('body')).toHaveAttribute('data-paper',paper);
  }
  await openMobileSetting(page,'theme'); await page.locator('.appearance-theme').click();
  const changedTheme=theme==='dark'?'light':'dark';
  await expect(page.locator('body')).toHaveAttribute('data-theme',changedTheme);
  await page.locator('.appearance-theme').click();
  await expect(page.locator('body')).toHaveAttribute('data-paper','ink');
  await openMobileSetting(page,'language');
  for (const next of ['zh-TW','en','ja','zh-CN',locale]) {
   await page.locator(`.interface-language-option[data-locale="${next}"]`).click();
   await expect(page.locator('.md-source')).toHaveValue(content);
  }
  await openMobileSetting(page,'info');
  await expect(page.locator('.mobile-settings-info')).toBeVisible();
  await expect(page.locator('[data-settings-tab="ai"]')).toBeHidden();
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.locator('.mobile-settings-done').click();
  await expect(panel).toBeHidden();
  await page.locator('.app-header .mobile-menu-toggle').click();
  await page.locator('[data-mobile-action="export"]').click();
  await expect(page.locator('.mobile-export-primary button:visible,.mobile-export-secondary button:visible')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await page.locator('.mobile-reading-nav button').last().click();
  await expect(page.locator('.md-source')).toHaveValue(content);
  await page.locator('.md-source').fill(content+'Final edit.');
  await page.locator('[data-mobile-edit-done]').click();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme',theme);
  await expect(page.locator('body')).toHaveAttribute('data-paper','ink');
  await expect(page.locator('body')).toHaveAttribute('data-reading-font','system-serif');
  await expect(page.locator('.md-preview')).toHaveCSS('font-size','17px');
  await expect(page.locator('.md-source')).toHaveValue(content+'Final edit.');
 });
}
for (const width of [719,720,721,759,760]) test(`settings reset and release focus on resize at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844}); await page.goto('/#editor');
 await expect(page.locator('.md-preview h1').first()).toBeVisible();
 await page.keyboard.press('Control+,'); await openMobileSetting(page,'font');
 await page.locator('.reading-font-select').selectOption('local-jinkai');
 await page.keyboard.press('Tab'); await page.keyboard.press('Escape');
 await expect(page.locator('.workspace-settings')).toBeHidden();
 await page.keyboard.press('Control+,'); await openMobileSetting(page,'language');
 await page.setViewportSize({width:761,height:844});
 await expect(page.locator('.workspace-settings')).toBeHidden();
 expect(await page.locator('.app-header').evaluate(el=>el.inert)).toBe(false);
 await page.keyboard.press('Control+,');
 await expect(page.locator('.workspace-settings-nav')).toBeVisible();
 await expect(page.locator('.reading-font-management')).not.toHaveAttribute('open','');
 await page.keyboard.press('Escape');
});
