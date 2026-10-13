import {test,expect,openEditor,setSource} from './fixtures';

const draft='# 合成测试文稿\n\n保留这段文字。';
async function seed(page) {
  await page.addInitScript(draft=>localStorage.setItem('md-editor-warm-v1',JSON.stringify({content:draft,fileName:'合成测试.md',comments:[{id:'one',type:'idea',quote:'这段文字',note:'保留批注',ts:1}]})),draft);
}

test('PC new confirmation cancels without losing source, annotation, selection or undo',async({page})=>{
  await seed(page);await openEditor(page);await setSource(page,draft+'新增');
  await page.locator('.md-source').evaluate((n:HTMLTextAreaElement)=>n.setSelectionRange(3,7));
  await page.locator('.workspace-file-actions .primary').click();
  const dialog=page.getByRole('dialog',{name:'新建文稿？'});await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'取消',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await expect(page.locator('.workspace-file-actions .primary')).toBeFocused();
  await expect(page.locator('.md-source')).toHaveValue(draft+'新增');
  expect(await page.locator('.md-source').evaluate((n:HTMLTextAreaElement)=>[n.selectionStart,n.selectionEnd])).toEqual([3,7]);
  await page.locator('.md-source').focus();await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.md-source')).toHaveValue(draft);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('md-editor-warm-v1')!).comments[0].note)).toBe('保留批注');
});

test('PC opening a replacement can be cancelled after reading; repeated cancellation keeps original draft',async({page})=>{
  await seed(page);
  await page.addInitScript(()=>{(window as any).showOpenFilePicker=async()=>[{name:'替换.md',getFile:async()=>({name:'替换.md',text:async()=>'# 新文稿',lastModified:1})}];});
  await openEditor(page);
  for(let i=0;i<2;i++){
    await page.locator('.open-doc-btn').click();
    const dialog=page.getByRole('dialog',{name:'打开另一篇文稿？'});await expect(dialog).toBeVisible();
    await dialog.getByRole('button',{name:'取消',exact:true}).click();
    await expect(page.locator('.md-source')).toHaveValue(draft);
  }
});

test('PC export explains ZIP contents and supplies separate annotation JSON without changing source',async({page})=>{
  await seed(page);await openEditor(page);await page.locator('.export-menu-toggle').click();
  await expect(page.locator('.pc-export-description')).toContainText('不含 ZIP 导入恢复');
  const download=page.waitForEvent('download');
  await page.locator('.pc-export-json').click();
  expect((await download).suggestedFilename()).toBe('合成测试.annotations.json');
  await expect(page.locator('.md-source')).toHaveValue(draft);
});

async function ai(page) {
  const state={found:false,requests:0,release:null as null|((body:string)=>void)};
  await seed(page);
  await page.route('**/src/editor/featureFlags.ts',r=>r.fulfill({contentType:'application/javascript',body:'export const ENABLE_AGENT_BRIDGE = true;'}));
  await page.route('http://127.0.0.1:4317/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/api/readiness')return route.fulfill({json:{bridgeAvailable:true,providers:{codex:{executable:state.found?'found':'missing'},claude:{executable:'missing'}}}});
    if(pathname==='/api/chat'){
      state.requests++;const body=await new Promise<string>(resolve=>{state.release=resolve;});
      return route.fulfill({contentType:'text/event-stream',body});
    }
    if(pathname==='/api/documents'&&route.request().method()==='POST')return route.fulfill({json:{documentId:'synthetic'}});
    return route.fulfill({json:{documents:[],messages:[],conversations:[],engines:[]}});
  });
  await openEditor(page);await page.locator('.header-actions .ai-entry').click();
  return state;
}

test('PC AI missing channel disables send without losing the unsent question',async({page})=>{
  await ai(page);await page.locator('.ai-input').fill('合成测试问题');
  await expect(page.locator('.ai-send')).toBeDisabled();
  await expect(page.locator('.pc-ai-state')).toContainText('配置');
  await page.locator('.ai-panel .panel-close').click();await page.locator('.header-actions .ai-entry').click();
  await expect(page.locator('.ai-input')).toHaveValue('合成测试问题');
});

test('PC AI settings save failure remains visible in the dialog and preserves the draft',async({page})=>{
  await ai(page);
  await page.evaluate(()=>{(window as any).mojianDesktop={aiSettings:async operation=>operation==='load'
    ?{ok:true,value:{providers:{gemini:{configured:false,model:'gemini-2.5-flash',proxy:''}},secureStorage:{available:true,status:'available'}}}
    :{ok:false,error:'合成安全存储失败，未保存。'}};});
  await page.locator('.ai-engine-chip').click();
  const dialog=page.locator('.ai-settings-modal');
  await dialog.locator('input[type=password]').fill('FAKE-LOCAL-ONLY');
  await dialog.getByRole('button',{name:'保存',exact:true}).click();
  await expect(dialog.locator('.ai-settings-note')).toHaveAttribute('data-state','error');
  await expect(dialog.locator('.ai-settings-note')).toContainText('合成安全存储失败');
  await expect(dialog.locator('input[type=password]')).toHaveValue('');
  await page.keyboard.press('Escape');await expect(page.locator('.ai-engine-chip')).toBeFocused();
  await expect(page.locator('.md-source')).toHaveValue(draft);
});

test('PC AI busy blocks duplicate sends and document changes; close/reopen and failed retry retain question',async({page})=>{
  const state=await ai(page);state.found=true;
  await page.locator('.ai-readiness').getByRole('button',{name:'重新检查',exact:true}).click();
  await page.locator('.ai-input').fill('只解释这段合成示例');await page.locator('.ai-send').click();
  await expect.poll(()=>state.requests).toBe(1);await expect(page.locator('.ai-send')).toBeDisabled();
  await expect(page.locator('.pc-ai-state')).toContainText('生成');
  const input=await page.locator('.ai-input').boundingBox(),send=await page.locator('.ai-send').boundingBox();
  expect(input!.x+input!.width).toBeLessThanOrEqual(send!.x);
  const hint=await page.locator('.pc-ai-busy-hint').boundingBox();
  expect(hint!.y+hint!.height).toBeLessThanOrEqual(send!.y);
  await page.locator('.ai-panel .panel-close').click();await page.locator('.workspace-file-actions .primary').click();
  await expect(page.locator('.md-source')).toHaveValue(draft);
  await page.locator('.header-actions .ai-entry').click();
  state.release!('event: error\ndata: {"message":"合成网络中断"}\n\n');
  await expect(page.locator('.ai-message-retry')).toBeEnabled();
  await expect(page.locator('.ai-message-user')).toContainText('只解释这段合成示例');
  await page.locator('.ai-message-retry').click();await expect.poll(()=>state.requests).toBe(2);
  state.release!('event: delta\ndata: {"text":"合成回答，未调用外部服务。"}\n\n');
  await expect(page.locator('.ai-message-assistant').last()).toContainText('合成回答');
  await expect(page.locator('.ai-message-retry')).toBeDisabled();
  await expect(page.locator('.md-source')).toHaveValue(draft);
  await page.setViewportSize({width:390,height:844});await expect(page.locator('.ai-panel')).toBeHidden();
});
