import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BridgeMethods } from '../../src/editor/bridgeMethods.ts';
import { ReadingMapMethods } from '../../src/editor/readingMapMethods.ts';
import { createRef, createStubElement } from '../helpers/dom.ts';

for (const kind of ['document', 'answer', 'map']) {
  for (const open of [true, false]) {
    test(`${kind} navigation preserves an explicitly ${open ? 'open' : 'closed'} recent sidebar`, async () => {
      const fetchBefore = globalThis.fetch;
      globalThis.fetch = async () => ({ ok: true, json: async () => ({ document: {
        documentId: 'doc', fileName: 'note.md', content: '# Article', annotations: [],
        messages: [{ requestId: 'answer', question: 'Question', answer: 'Answer' }]
      } }) }) as Response;
      try {
        const editor = Object.assign(Object.create(BridgeMethods.prototype), {
          _sidebarExplicitOpen: open, sourceRef: createRef({ value: '' }),
          documentSidebarRef: createRef(createStubElement()), previewRef: createRef(createStubElement()),
          recentDocuments: [], _flushBridgeSync: async () => {}, _detachLocalFile() {},
          _cleanOpenedMarkdown: value => value, _resetEditingHistory() {},
          _setFileName(name) { this.fileName = name; }, _showConversationMessages() {},
          _renderComments() {}, _renderPreview() {}, _setDirty() {}, _persist() {},
          _renderRecentDocuments() {}, _setStatus() {}, _syncViewMode() {},
          _reattachLocalFileForDocument: async () => {}, _hydrateLocalImages() {},
          _readingMapNodes: () => [], _readingMapBuildIndex() {}, _readingMapBuildTitles() {},
          _readingMapParentIndex() {}, _bindReadingMapClicks() {}, _readingMapMarkdown: () => '# Map'
        });
        if (kind === 'document') await editor.openRecentDocument('doc');
        else if (kind === 'answer') await editor.openAnswerDocument('doc', 'answer');
        else await ReadingMapMethods.prototype.openReadingMap.call(editor, 'doc');
        assert.equal(editor.activeDocumentId, 'doc');
        assert.equal(editor._sidebarExplicitOpen, open);
      } finally { globalThis.fetch = fetchBefore; }
    });
  }
}
