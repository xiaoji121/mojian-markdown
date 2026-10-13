import {test,expect,openEditor,setSource} from './fixtures';
const draft='# 合成文稿\n\n取消和失败都必须保留这段内容。';

test('PC save failure and cancelled Save As preserve draft and focus, then retry saves',async({page})=>{
  await page.addInitScript(()=>{
    const state={fail:true,cancel:false,content:'',name:'合成保存.md',lastModified:1};(window as any).fileFixture=state;
    (window as any).showSaveFilePicker=async()=>{
      if(state.cancel)throw new DOMException('cancelled','AbortError');
      return {name:state.name,getFile:async()=>({name:state.name,lastModified:state.lastModified,text:async()=>state.content}),createWritable:async()=>{
        if(state.fail)throw Error('synthetic write failure');
        return {write:async text=>{state.content=text;},close:async()=>{state.lastModified++;}};
      },queryPermission:async()=> 'granted'};
    };
  });
  await openEditor(page);await setSource(page,draft);
  await page.locator('.export-menu-toggle').click();await page.locator('.export-menu').getByRole('menuitem',{name:/另存为/}).click();
  const dialog=page.getByRole('dialog',{name:'文稿尚未写入文件'});await expect(dialog).toBeVisible();
  await page.evaluate(()=>{(window as any).fileFixture.cancel=true;});
  await dialog.getByRole('button',{name:'另存为…',exact:true}).click();
  await expect(page.locator('.md-source')).toHaveValue(draft);await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.export-menu-toggle')).toBeFocused();
  await page.evaluate(()=>Object.assign((window as any).fileFixture,{cancel:false,fail:false}));
  await page.locator('.pc-file-warning button').click();await dialog.getByRole('button',{name:'重试保存'}).click();
  await expect(dialog).toHaveCount(0);await expect(page.locator('.pc-file-warning')).toBeHidden();
  expect(await page.evaluate(()=>(window as any).fileFixture.content)).toBe(draft);
});

test('PC image export traps focus, blocks busy close, and retains options after encoding failure',async({page})=>{
  await openEditor(page);await setSource(page,draft);await page.locator('.export-menu-toggle').click();await page.locator('.longimg-entry').click();
  await expect(page.locator('.longimg-save')).toBeEnabled();
  await page.locator('.longimg-modal button:visible').first().focus();await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.longimg-save')).toBeFocused();
  const before=await page.locator('.longimg-font-value').textContent();
  await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=function(callback){(window as any).failImage=()=>callback(null);};});
  await page.locator('.longimg-save').click();await expect(page.locator('.longimg-modal-close')).toBeDisabled();
  await page.keyboard.press('Escape');await expect(page.locator('.longimg-overlay')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).failImage)).toBe('function');
  await page.evaluate(()=>(window as any).failImage());
  await expect(page.locator('.pc-image-status')).toHaveAttribute('data-state','failed');
  await expect(page.locator('.longimg-save')).toBeEnabled();await expect(page.locator('.longimg-font-value')).toHaveText(before!);
  await page.keyboard.press('Escape');await expect(page.locator('.export-menu-toggle')).toBeFocused();
  await expect(page.locator('.md-source')).toHaveValue(draft);
});

test('PC repeated backup clicks emit one complete three-file ZIP and keep original annotations',async({page})=>{
  await page.addInitScript(draft=>localStorage.setItem('md-editor-warm-v1',JSON.stringify({content:draft,fileName:'合成文稿.md',comments:[{id:'n',quote:'这段内容',note:'保留我的想法',type:'idea',ts:1}]})),draft);
  await openEditor(page);await page.locator('.export-menu-toggle').click();
  const download=page.waitForEvent('download');let count=0;page.on('download',()=>count++);
  await page.locator('.export-primary').evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
  const file=await download;expect(file.suggestedFilename()).toBe('合成文稿-backup.zip');
  const stream=await file.createReadStream();const chunks=[];for await(const chunk of stream!)chunks.push(chunk);const zip=Buffer.concat(chunks);
  for(const name of ['合成文稿.md','合成文稿.annotations.md','合成文稿.annotations.json'])expect(zip.includes(Buffer.from(name))).toBe(true);
  expect(count).toBe(1);await expect(page.locator('.md-source')).toHaveValue(draft);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('md-editor-warm-v1')!).comments[0].note)).toBe('保留我的想法');
});

test('PC successful image export clears the generating state and returns focus on close',async({page})=>{
  await openEditor(page);await setSource(page,draft);await page.locator('.export-menu-toggle').click();await page.locator('.longimg-entry').click();
  await expect(page.locator('.longimg-save')).toBeEnabled();
  const download=page.waitForEvent('download');await page.locator('.longimg-save').click();await download;
  await expect(page.locator('.pc-image-status')).toHaveAttribute('data-state','complete');
  await expect(page.locator('.pc-image-status progress')).toBeHidden();
  await page.keyboard.press('Escape');await expect(page.locator('.export-menu-toggle')).toBeFocused();
  await expect(page.locator('.md-source')).toHaveValue(draft);
});
