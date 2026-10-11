// The mobile form is transactional; the durable annotation schema stays unchanged.
export function createAnnotationDraft(annotation: any, documentKey: string, isNew = false) {
  const original = { ...annotation };
  return { original, documentKey, isNew, note: annotation.note || '', reply: annotation.reply || '' };
}
export function annotationDraftDirty(draft: any): boolean {
  return !!draft && (draft.note !== (draft.original.note || '') || draft.reply !== (draft.original.reply || ''));
}
export function commitAnnotationDraft(draft: any, annotations: any[], documentKey: string): any {
  if (!draft || draft.documentKey !== documentKey) return { error: 'document' };
  const current = annotations.find(c => c.id === draft.original.id);
  if (!draft.isNew && (!current || JSON.stringify(current) !== JSON.stringify(draft.original))) return { error: 'conflict' };
  const annotation = { ...(current || draft.original), note: draft.note, reply: draft.reply };
  if (draft.isNew) { annotation.id = 'c' + Date.now() + Math.floor(Math.random() * 999999); annotation.ts = Date.now(); }
  if (draft.reply !== (draft.original.reply || '')) annotation.replyAt = Date.now();
  return { error: '', annotation };
}
