import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BridgeMethods } from '../../src/editor/bridgeMethods.ts';
import { DesktopDocumentSessionMethods } from '../../src/editor/desktopDocumentSessionMethods.ts';

test('failed workspace writes publish a failure state instead of confirming a saved draft', async () => {
  const original = globalThis.fetch;
  const events:string[] = [];
  const editor:any = { _documentPayload:()=>({fileName:'note.md',content:'kept'}), comments:[],
    _pcBridgeFeedback:(state:string)=>events.push(state) };
  globalThis.fetch = async()=>new Response('',{status:503});
  try { await BridgeMethods.prototype._writeDocumentToBridge.call(editor); assert.deepEqual(events,['pending','failed']); }
  finally { globalThis.fetch = original; }
});

test('desktop reports pending when a completed write contains an older note snapshot',()=>{
  const editor:any={_pcDesktop:()=>true,fileName:'one.md',_pcDocumentSnapshot:()=> 'new note',_pcSyncSaveStatus(){}};
  DesktopDocumentSessionMethods.prototype._pcBridgeFeedback.call(editor,'saved',{fileName:'one.md'},'old note');
  assert.equal(editor._pcBridgeState,'pending');
  DesktopDocumentSessionMethods.prototype._pcBridgeFeedback.call(editor,'saved',{fileName:'one.md'},'new note');
  assert.equal(editor._pcBridgeState,'saved');
});

test('mobile keeps its existing draft and switching behavior',()=>{
  let called=false;
  const editor:any={_pcDesktop:()=>false,_saveT:123,_autosave(){called=true;},_pcBridgeState:'failed'};
  DesktopDocumentSessionMethods.prototype._pcFlushPendingDraft.call(editor);
  assert.equal(called,false); assert.equal(editor._saveT,123);
  assert.equal(DesktopDocumentSessionMethods.prototype._pcCanLeaveDocument.call(editor),true);
});

test('desktop document switching stops before fetching another document when synchronization failed', async () => {
  const original = globalThis.fetch; let fetched = false;
  const editor:any = { sourceRef:{current:{value:'keep note'}}, fileName:'note.md', comments:[{note:'latest'}],
    _flushBridgeSync:async()=>{}, _pcCanLeaveDocument:()=>false };
  globalThis.fetch = async()=>{ fetched=true; return new Response('{}'); };
  try { await BridgeMethods.prototype.openRecentDocument.call(editor,'other'); assert.equal(fetched,false); assert.equal(editor.sourceRef.current.value,'keep note'); }
  finally { globalThis.fetch = original; }
});
