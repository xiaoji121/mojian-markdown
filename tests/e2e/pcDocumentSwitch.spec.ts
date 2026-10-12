import { test,expect,openEditor,setSource } from './fixtures';

async function workspace(page) {
  const state = { fail:false, hold:false, release:null as null|(()=>void), requested:false };
  const documents = {
    one:{documentId:'one',fileName:'第一篇.md',content:'# 第一篇\n\n保留我的段落。',annotations:[{id:'note',type:'idea',quote:'保留我的段落',occ:0,note:'原想法',ts:1}],messages:[],updatedAt:'2026-10-12'},
    two:{documentId:'two',fileName:'第二篇.md',content:'# 第二篇\n\n另一段阅读。',annotations:[],messages:[],updatedAt:'2026-10-11'}
  };
  await page.addInitScript(doc=>localStorage.setItem('md-editor-warm-v1',JSON.stringify({content:doc.content,fileName:doc.fileName,bridgeDocumentId:'one',comments:doc.annotations})),documents.one);
  await page.route('**/src/editor/featureFlags.ts',route=>route.fulfill({contentType:'application/javascript',body:'export const ENABLE_AGENT_BRIDGE = true;'}));
  await page.route('http://127.0.0.1:4317/**',async route=>{
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/documents' && request.method() === 'POST') {
      if (state.fail) return route.fulfill({status:503,json:{error:'test sync failure'}});
      const data=request.postDataJSON(), id=data.document.documentId || 'one';
      documents[id]={...documents[id],...data.document,annotations:data.annotations};
      return route.fulfill({json:{documentId:id}});
    }
    if (url.pathname === '/api/documents') return route.fulfill({json:{documents:Object.values(documents)}});
    const id=url.pathname.split('/')[3];
    if (documents[id]) {
      if (state.hold && id==='two') {state.requested=true;await new Promise<void>(resolve=>{state.release=resolve;});}
      return route.fulfill({json:{document:documents[id]}});
    }
    return route.fulfill({json:{conversations:[],messages:[],engines:[]}});
  });
  await openEditor(page);
  return state;
}
const target = (page,name) => page.locator('.recent-document-item').filter({hasText:name});

test('PC failed sync blocks document switch, retains note, and retry confirms actual success',async({page})=>{
  const state=await workspace(page); state.fail=true;
  await page.locator('.header-actions button[aria-label="批注"]').click();
  await page.locator('.comment-note-input').fill('不能被失败的同步覆盖');
  await target(page,'第二篇').click();
  const dialog=page.getByRole('dialog',{name:'本地工作区同步未完成'}); await expect(dialog).toBeVisible();
  await expect(page.locator('.md-source')).toHaveValue('# 第一篇\n\n保留我的段落。');
  await dialog.getByRole('button',{name:'重试同步'}).click(); await expect(dialog).toBeVisible();
  state.fail=false; await dialog.getByRole('button',{name:'重试同步'}).click(); await expect(dialog).toHaveCount(0);
  await target(page,'第二篇').click();
  await expect(page.locator('.md-source')).toHaveValue('# 第二篇\n\n另一段阅读。');
  await target(page,'第一篇').click(); await expect(page.locator('.comment-note-input')).toHaveValue('不能被失败的同步覆盖');
});

test('PC delayed document response cannot overwrite edits made while it was loading',async({page})=>{
  const state=await workspace(page); state.hold=true;
  await target(page,'第二篇').click(); await expect.poll(()=>state.requested).toBe(true);
  await setSource(page,'# 第一篇\n\n等待期间继续写的内容。');
  state.release!();
  await expect(page.locator('.save-status-toast')).toContainText('切换期间内容已变化');
  await expect(page.locator('.md-source')).toHaveValue('# 第一篇\n\n等待期间继续写的内容。');
});

test('PC round trip between workspace documents retains source caret and undo history',async({page})=>{
  await workspace(page);
  const longText = '# 第一篇\n\n' + Array.from({length:50},(_,i)=>`第 ${i} 段：保留阅读位置和编辑历史。`).join('\n\n');
  await setSource(page,longText);
  // Moving the caret starts a separate undo group instead of coalescing with fill.
  await page.locator('.md-source').press('ArrowLeft'); await page.locator('.md-source').pressSequentially('new');
  const value=await page.locator('.md-source').inputValue();
  await page.locator('.md-source').evaluate((node:HTMLTextAreaElement)=> { node.setSelectionRange(3,6); node.scrollTop=470; });
  await page.locator('.md-preview').evaluate(node=>{node.scrollTop=350;});
  await target(page,'第二篇').click(); await expect(page.locator('.md-source')).toHaveValue('# 第二篇\n\n另一段阅读。');
  await target(page,'第一篇').click(); await expect(page.locator('.md-source')).toHaveValue(value);
  expect(await page.locator('.md-source').evaluate((node:HTMLTextAreaElement)=>[node.selectionStart,node.selectionEnd])).toEqual([3,6]);
  expect(await page.locator('.md-source').evaluate(node=>node.scrollTop)).toBe(470);
  expect(await page.locator('.md-preview').evaluate(node=>node.scrollTop)).toBe(350);
  await page.locator('.md-source').focus(); await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.md-source')).toHaveValue(longText);
});
