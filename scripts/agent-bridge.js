import { createServer } from 'node:http';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDocumentStore, normalizeAnnotation } from './agent-bridge-store.js';
import { normalizeEngine, runEngine } from './agent-bridge-engines.js';

const PORT = Number(process.env.AGENT_BRIDGE_PORT || 4317);
const ROOT = process.env.AGENT_BRIDGE_WORKSPACE || join(process.cwd(), '.reading-workspace');
const store = createDocumentStore(ROOT);
const { readDocument, writeDocument, upsertDocument, listDocuments } = store;

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function summarizeDocument(doc) {
  const messages = Array.isArray(doc.messages) ? doc.messages : [];
  const answers = messages
    .filter((item) => item.answer)
    .map((item) => ({
      requestId: item.requestId,
      question: item.question || '未命名问题',
      engine: item.engine,
      updatedAt: item.answerAt || item.questionAt || doc.updatedAt
    }));
  return {
    documentId: doc.documentId,
    title: doc.title,
    fileName: doc.fileName,
    localPath: doc.localPath,
    updatedAt: doc.updatedAt,
    annotationCount: Array.isArray(doc.annotations) ? doc.annotations.length : 0,
    questionCount: messages.length,
    answerDocuments: answers
  };
}

function conversationSummary(doc) {
  const messages = Array.isArray(doc.messages) ? doc.messages : [];
  const last = messages[messages.length - 1] || {};
  return {
    documentId: doc.documentId,
    title: doc.title || doc.fileName,
    lastQuestion: last.question || '',
    questionCount: messages.length,
    updatedAt: doc.updatedAt
  };
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function bridgePrompt(body, doc) {
  const selection = body.selection || {};
  return [
    '你是本地 Markdown 阅读助手。请基于用户选中的原文和整篇文档回答问题。',
    '',
    `文件名：${doc.fileName}`,
    '',
    '选中原文：',
    selection.quote || '',
    '',
    '上下文：',
    selection.surroundingText || '',
    '',
    '整篇文档：',
    doc.content || '',
    '',
    '用户问题：',
    body.question || ''
  ].join('\n');
}

async function handleChat(req, res) {
  const body = await readBody(req);
  const engine = normalizeEngine(body.engine);
  const doc = await upsertDocument(body.document || {});
  const requestId = randomUUID();
  const message = {
    requestId,
    engine,
    question: body.question || '',
    quote: body.selection?.quote || '',
    questionAt: new Date().toISOString(),
    answer: ''
  };
  doc.messages.push(message);
  doc.annotations.push(normalizeAnnotation({
    id: requestId,
    requestId,
    type: 'ai',
    engine,
    quote: message.quote,
    note: message.question,
    question: message.question,
    answer: '',
    aiStatus: 'pending'
  }));
  await writeDocument(doc);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  writeSse(res, 'meta', {
    requestId,
    engine,
    documentId: doc.documentId,
    documentChars: doc.content.length
  });

  try {
    const answer = await runEngine(engine, bridgePrompt(body, doc), (delta) => {
      writeSse(res, 'delta', { text: delta });
    });
    message.answer = answer;
    message.answerAt = new Date().toISOString();
    const annotation = doc.annotations.find((item) => item.requestId === requestId);
    if (annotation) {
      annotation.answer = message.answer;
      annotation.aiStatus = 'answered';
    }
    await writeDocument(doc);
  } catch (error) {
    writeSse(res, 'error', { message: error.message || String(error) });
  } finally {
    res.end();
  }
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  try {
    if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/api/documents') {
      const documents = (await listDocuments()).map(summarizeDocument);
      return sendJson(res, 200, { documents });
    }
    if (req.method === 'POST' && url.pathname === '/api/documents') {
      const body = await readBody(req);
      const doc = await upsertDocument(body.document || {}, body.annotations);
      return sendJson(res, 200, { documentId: doc.documentId, document: doc });
    }
    if (req.method === 'POST' && url.pathname === '/api/history') {
      const body = await readBody(req);
      const doc = await upsertDocument(body.document || {});
      return sendJson(res, 200, { documentId: doc.documentId, messages: doc.messages || [] });
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') return handleChat(req, res);
    if (req.method === 'GET' && url.pathname === '/api/conversations') {
      const conversations = (await listDocuments()).filter((doc) => doc.messages?.length).map(conversationSummary);
      return sendJson(res, 200, { conversations });
    }
    if (parts[0] === 'api' && parts[1] === 'conversations' && req.method === 'GET') {
      const doc = await readDocument(parts[2]);
      return sendJson(res, 200, { documentId: doc.documentId, messages: doc.messages || [] });
    }
    if (parts[0] === 'api' && parts[1] === 'documents' && parts.length === 3 && req.method === 'GET') {
      return sendJson(res, 200, { document: await readDocument(parts[2]) });
    }
    if (parts[0] === 'api' && parts[1] === 'documents' && parts[3] === 'annotations' && req.method === 'DELETE') {
      const doc = await readDocument(parts[2]);
      doc.annotations = (doc.annotations || []).filter((item) => item.id !== parts[4] && item.requestId !== parts[4]);
      await writeDocument(doc);
      return sendJson(res, 200, { ok: true });
    }
    return sendError(res, 404, 'Not found');
  } catch (error) {
    return sendError(res, 500, error.message || String(error));
  }
}

const server = createServer(handleRequest);
async function verifyExistingBridge() {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    if (await verifyExistingBridge()) {
      console.log(`Agent Bridge already available on http://127.0.0.1:${PORT}`);
      process.exit(0);
    }
    console.error(`Port ${PORT} is already in use, but it does not look like Agent Bridge.`);
    process.exit(1);
  }
  throw error;
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Agent Bridge listening on http://127.0.0.1:${PORT}`);
  console.log(`Reading Workspace: ${ROOT}`);
});
