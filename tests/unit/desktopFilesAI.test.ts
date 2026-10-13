import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DesktopFileMethods} from '../../src/editor/desktopFileMethods.ts';
import {DesktopExportMethods} from '../../src/editor/desktopExportMethods.ts';
import {AIMethods} from '../../src/editor/aiMethods.ts';

function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}

test('late desktop AI history cannot replace a question sent while history was loading',async()=>{
  const prior=globalThis.fetch, gate=deferred();
  globalThis.fetch=async()=>{await gate.promise;return {ok:true,json:async()=>({documentId:'one',messages:[{question:'old'}]})} as Response;};
  let rendered=false;
  const editor:any={_pcDesktop:()=>true,aiBusy:false,aiMessages:[],_documentPayload:()=>({documentId:'one'}),_showConversationMessages:()=>{rendered=true;}};
  try{
    const pending=AIMethods.prototype._loadCurrentDocumentHistory.call(editor);
    editor.aiBusy=true;editor.aiMessages.push({role:'user',text:'new question'});gate.resolve();await pending;
    assert.equal(rendered,false);
  }finally{globalThis.fetch=prior;}
});

test('desktop import read failure never changes source, annotations or file link',async()=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{showOpenFilePicker:async()=>[{getFile:async()=>({text:async()=>{throw Error('read failed');}})}]}});
  const editor:any=Object.create(DesktopFileMethods.prototype), handle={name:'original'};
  Object.assign(editor,{_pcDesktop:()=>true,sourceRef:{current:{value:'keep'}},comments:[{note:'keep'}],fileHandle:handle,_setStatus:()=>{}});
  try{await editor._pcOpenFile();assert.equal(editor.sourceRef.current.value,'keep');assert.deepEqual(editor.comments,[{note:'keep'}]);assert.equal(editor.fileHandle,handle);assert.equal(editor._pcFileBusy,false);}
  finally{if(prior)Object.defineProperty(globalThis,'window',prior);else delete globalThis.window;}
});

test('repeated desktop save clicks do not start overlapping operations',async()=>{
  const gate=deferred();let count=0;
  const editor:any=Object.create(DesktopFileMethods.prototype);
  Object.assign(editor,{dirty:true,_setStatus:()=>{},onSave:async()=>{count++;await gate.promise;}});
  const pending=editor._pcRunSave(false);assert.equal(await editor._pcRunSave(false),false);assert.equal(count,1);
  gate.resolve();await pending;assert.equal(editor._pcSavePending,false);
});

test('backup download failure retains current draft and retry is available',async()=>{
  const editor:any=Object.create(DesktopExportMethods.prototype);let fail=true,downloads=0,status='';
  Object.assign(editor,{fileName:'synthetic.md',sourceRef:{current:{value:'# Keep'}},comments:[{id:'a',type:'idea',quote:'Keep',note:'Keep note',ts:1}],_annotationTypeLabel:()=> 'Note',_setStatus:text=>{status=text;},_downloadBlob:()=>{if(fail)throw Error('blocked');downloads++;}});
  assert.equal(await editor._pcDownloadBackup(),false);assert.match(status,/失败/);assert.equal(editor.sourceRef.current.value,'# Keep');assert.equal(editor.comments[0].note,'Keep note');
  fail=false;assert.equal(await editor._pcDownloadBackup(),true);assert.equal(downloads,1);
});

test('opening a file cannot replace annotations edited while workspace metadata was loading',async()=>{
  const {BridgeMethods}=await import('../../src/editor/bridgeMethods.ts');
  const prior=globalThis.fetch, gate=deferred();
  globalThis.fetch=async()=>{await gate.promise;return {ok:true,json:async()=>({documents:[{documentId:'one'}],document:{documentId:'one',annotations:[{note:'stale'}]}})} as Response;};
  const editor:any={agentBridgeEnabled:true,sourceRef:{current:{value:'same'}},comments:[],fileName:'one.md',_pcDocumentSnapshot(){return JSON.stringify(this.comments);},_pcDocumentChanged(snapshot){return snapshot!==this._pcDocumentSnapshot();},_matchRecentDocumentByName:()=>({documentId:'one'}),_commentsFromBridge:a=>a,_renderRecentDocuments:()=>{}};
  try{
    const pending=BridgeMethods.prototype._adoptBridgeDocument.call(editor,'one.md');
    editor.comments=[{note:'new note'}];gate.resolve();await pending;
    assert.deepEqual(editor.comments,[{note:'new note'}]);
  }finally{globalThis.fetch=prior;}
});
