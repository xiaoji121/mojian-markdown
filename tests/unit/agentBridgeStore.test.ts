import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDocumentStore } from '../../scripts/agent-bridge-store.js';

async function withStore(run: (store: ReturnType<typeof createDocumentStore>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'bridge-store-'));
  try {
    await run(createDocumentStore(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('同名文档重复上报时复用既有文档，不生成副本', async () => {
  await withStore(async (store) => {
    const first = await store.upsertDocument({ fileName: 'note.md', title: 'note.md', content: 'v1' });
    const second = await store.upsertDocument({ fileName: 'note.md', title: 'note.md', content: 'v2' });

    assert.equal(second.documentId, first.documentId);
    assert.equal(second.content, 'v2');
    assert.equal((await store.listDocuments()).length, 1);
  });
});

test('同名复用时保留既有批注与问答记录', async () => {
  await withStore(async (store) => {
    const first = await store.upsertDocument(
      { fileName: 'note.md', content: 'v1' },
      [{ id: 'a1', quote: '原文', type: 'marker', note: '' }]
    );
    first.messages.push({ requestId: 'q1', question: '问题', answer: '回答' });
    await store.writeDocument(first);

    const second = await store.upsertDocument({ fileName: 'note.md', content: 'v2' });

    assert.equal(second.annotations.length, 1);
    assert.equal(second.annotations[0].id, 'a1');
    assert.equal(second.messages.length, 1);
  });
});

test('未命名文档不做同名合并', async () => {
  await withStore(async (store) => {
    await store.upsertDocument({ fileName: '未命名.md', content: 'a' });
    await store.upsertDocument({ fileName: '未命名.md', content: 'b' });

    assert.equal((await store.listDocuments()).length, 2);
  });
});

test('显式 documentId 命中时优先按 id 更新，不误合并同名文档', async () => {
  await withStore(async (store) => {
    const a = await store.upsertDocument({ fileName: 'note.md', content: 'a' });
    const b = await store.upsertDocument({ fileName: 'other.md', content: 'b' });

    const updated = await store.upsertDocument({ documentId: b.documentId, fileName: 'note.md', content: 'c' });

    assert.equal(updated.documentId, b.documentId);
    assert.equal((await store.readDocument(a.documentId)).content, 'a');
  });
});

test('同名但本地路径不同的文档不合并，路径相同时按路径复用', async () => {
  await withStore(async (store) => {
    const a = await store.upsertDocument({ fileName: 'note.md', localPath: '笔记库/a/note.md', content: 'a' });
    const b = await store.upsertDocument({ fileName: 'note.md', localPath: '笔记库/b/note.md', content: 'b' });

    assert.notEqual(b.documentId, a.documentId);
    assert.equal((await store.listDocuments()).length, 2);

    const again = await store.upsertDocument({ fileName: 'note.md', localPath: '笔记库/b/note.md', content: 'b2' });
    assert.equal(again.documentId, b.documentId);
    assert.equal(again.content, 'b2');
  });
});

test('带路径的上报可认领此前没有路径的同名文档', async () => {
  await withStore(async (store) => {
    const legacy = await store.upsertDocument({ fileName: 'note.md', content: 'v1' });

    const updated = await store.upsertDocument({ fileName: 'note.md', localPath: '笔记库/note.md', content: 'v2' });

    assert.equal(updated.documentId, legacy.documentId);
    assert.equal(updated.localPath, '笔记库/note.md');
  });
});

test('后续上报缺省路径时保留已知路径', async () => {
  await withStore(async (store) => {
    await store.upsertDocument({ fileName: 'note.md', localPath: '笔记库/note.md', content: 'v1' });

    const updated = await store.upsertDocument({ fileName: 'note.md', content: 'v2' });

    assert.equal(updated.localPath, '笔记库/note.md');
  });
});

test('存在多份历史同名副本时，优先复用带问答记录的那份', async () => {
  await withStore(async (store) => {
    await store.writeDocument({
      documentId: 'd-plain', fileName: 'note.md', title: 'note.md',
      content: 'x', annotations: [], messages: [], createdAt: '2026-01-01T00:00:00.000Z'
    });
    await store.writeDocument({
      documentId: 'd-asked', fileName: 'note.md', title: 'note.md',
      content: 'x', annotations: [], createdAt: '2026-01-01T00:00:00.000Z',
      messages: [{ requestId: 'q1', question: '问题', answer: '回答' }]
    });

    const doc = await store.upsertDocument({ fileName: 'note.md', content: 'y' });

    assert.equal(doc.documentId, 'd-asked');
    assert.equal(doc.messages.length, 1);
  });
});
