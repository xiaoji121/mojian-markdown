import { test,expect,openEditor,setSource } from './fixtures';

for (const width of [900,1440]) test(`PC ${width}: source line numbers and search mirror remain aligned after wrapping and scrolling`,async({page})=>{
  await page.setViewportSize({width,height:900}); await openEditor(page);
  const text = '# Title\n\n' + Array.from({length:120},(_,i)=>`${i}: a long paragraph 中文文字保持换行位置。`.repeat(3)).join('\n');
  await setSource(page,text);
  await expect(page.locator('.pc-source-line')).toHaveCount(122);
  const heights = await page.locator('.md-source').evaluate((source:HTMLTextAreaElement)=>{
    const layer = document.querySelector('.source-highlight-layer')!;
    return [source.scrollHeight,layer.scrollHeight];
  });
  expect(Math.abs(heights[0]-heights[1])).toBeLessThan(3);
  await page.keyboard.press('ControlOrMeta+f');
  await page.getByRole('textbox',{name:'搜索文本',exact:true}).fill('119:');
  const mark = page.locator('.source-mark.is-current').first();
  await expect(mark).toBeInViewport();
  expect(await page.locator('.md-source').evaluate((source:HTMLTextAreaElement)=>source.scrollTop === document.querySelector('.source-highlight-layer')!.scrollTop)).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.locator('.md-source')).toHaveValue(text);
});
