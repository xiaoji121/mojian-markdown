import { createServer } from 'node:http';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createDocumentStore, normalizeAnnotation } from './agent-bridge-store.js';

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

function claudeArgs(prompt) {
  const raw = process.env.AGENT_BRIDGE_CLAUDE_ARGS;
  if (raw) return [...raw.split(' ').filter(Boolean), prompt];
  return ['-p', prompt];
}

function streamClaude(prompt, onDelta) {
  return new Promise((resolve, reject) => {
    const command = process.env.AGENT_BRIDGE_CLAUDE_COMMAND || 'claude';
    const child = spawn(command, claudeArgs(prompt), { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stdout.on('data', (chunk) => onDelta(chunk.toString('utf8')));
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Claude CLI exited with code ${code}`));
    });
  });
}

async function handleChat(req, res) {
  const body = await readBody(req);
  const doc = await upsertDocument(body.document || {});
  const requestId = randomUUID();
  const message = {
    requestId,
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
    documentId: doc.documentId,
    documentChars: doc.content.length
  });

  let answer = '';
  try {
    await streamClaude(bridgePrompt(body, doc), (delta) => {
      answer += delta;
      writeSse(res, 'delta', { text: delta });
    });
    message.answer = answer.trim();
    message.answerAt = new Date().toISOString();
    const annotation = doc.annotations.find((item) => item.requestId === requestId);
    if (annotation) {
      annotation.answer = message.answer;
      annotation.aiStatus = 'answered';
    }
    await writeDocument(doc);
  } catch (error) {
    const messageText = error?.code === 'ENOENT'
      ? '未找到 Claude CLI。请先安装并登录 Claude Code，或设置 AGENT_BRIDGE_CLAUDE_COMMAND。'
      : (error.message || String(error));
    writeSse(res, 'error', { message: messageText });
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
