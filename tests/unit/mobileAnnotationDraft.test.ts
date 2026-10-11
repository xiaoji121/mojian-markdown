import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnnotationDraft, annotationDraftDirty, commitAnnotationDraft } from '../../src/editor/mobileAnnotationDraft.ts';
test('draft edits never mutate committed annotation and retain unknown fields', () => {
 const stored = {id:'c1',quote:'句子',type:'marker',note:'原想法',reply:'原回答',start:3,custom:'keep'};
 const draft = createAnnotationDraft(stored, 'doc1');
 draft.note = '新想法'; draft.reply = '新回答';
 assert.equal(stored.note, '原想法'); assert.equal(annotationDraftDirty(draft), true);
 const result = commitAnnotationDraft(draft, [stored], 'doc1');
 assert.equal(result.error, ''); assert.equal(result.annotation.custom, 'keep'); assert.equal(result.annotation.note, '新想法');
});
test('cannot overwrite changed or removed annotation or another document', () => {
 const stored = {id:'c1',quote:'句子',type:'idea',note:'before'};
 const draft = createAnnotationDraft(stored, 'doc1'); draft.note = 'after';
 assert.ok(commitAnnotationDraft(draft, [stored], 'doc2').error);
 assert.ok(commitAnnotationDraft(draft, [], 'doc1').error);
 assert.ok(commitAnnotationDraft(draft, [{...stored,note:'external'}], 'doc1').error);
});
test('new idea exists only after explicit commit; empty draft is clean', () => {
 const draft = createAnnotationDraft({quote:'句子',type:'idea',note:''}, 'doc1', true);
 assert.equal(annotationDraftDirty(draft), false);
 draft.note = '想法'; assert.equal(annotationDraftDirty(draft), true);
 const result = commitAnnotationDraft(draft, [], 'doc1'); assert.ok(result.annotation.id); assert.equal(result.annotation.quote, '句子');
});
