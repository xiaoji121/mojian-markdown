import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MobileFileMethods} from '../../src/editor/mobileFileMethods.ts';
test('failed draft persistence leaves replacement source, annotations, identity and history untouched',()=>{
 const source={value:'# existing'};const comments=[{id:'c1',note:'keep'}];let detached=false,reset=false,error='';
 const context:any={sourceRef:{current:source},fileName:'existing.md',comments,bridgeDocumentId:'doc',activeDocumentId:'doc',_editingHistory:['existing'],
 _setFileName(name:string){this.fileName=name;},_persist(){return false;},_detachLocalFile(){detached=true;},_resetEditingHistory(){reset=true;},_mfFailure(title:string){error=title;}};
 assert.equal(MobileFileMethods.prototype._mfApplyImport.call(context,'new.md','# new'),false);
 assert.equal(source.value,'# existing');assert.equal(context.fileName,'existing.md');assert.equal(context.comments,comments);assert.equal(context.bridgeDocumentId,'doc');assert.equal(context.activeDocumentId,'doc');
 assert.equal(detached,false);assert.equal(reset,false);assert.deepEqual(context._editingHistory,['existing']);assert.ok(error);
});
test('closing a confirmation invalidates late file reads and restores original inert state',()=>{
 const background={inert:true},root={hidden:false,innerHTML:'confirmation'};
 const context:any={_mfRoot:root,_mfImportToken:2,_mfInert:[[background,false]],_mfFocus:null};
 MobileFileMethods.prototype._mfClose.call(context);assert.equal(root.hidden,true);assert.equal(background.inert,false);assert.equal(context._mfImportToken,3);
});
