// Agent Bridge：本地阅读工作区 + AI 问答的 HTTP 服务。
// 两种使用方式：
//   CLI —— `node scripts/agent-bridge.js`，固定端口 4317，供 `npm run dev` 的网页版访问；
//   嵌入 —— Electron 桌面端 import { startAgentBridge }，随机端口 + 静态托管前端（同源，无需 CORS）。
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createDocumentStore, normalizeAnnotation } from './agent-bridge-store.js';
import { normalizeEngine, runEngine } from './agent-bridge-engines.js';

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
};

function defaultWorkspaceRoot() {
  return process.env.AGENT_BRIDGE_WORKSPACE || join(process.cwd(), '.reading-workspace');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function summarizeDocument(doc) {
  const messages = Array.isArray(doc.messages) ? doc.messages : [];
  // parentRequestId 指向提问时所在的子文档，前端据此把追问渲染成嵌套树。
  const answers = messages
    .filter((item) => item.answer)
    .map((item) => ({
      requestId: item.requestId,
      question: item.question || '未命名问题',
      engine: item.engine,
      parentRequestId: item.parentRequestId || undefined,
      updatedAt: item.answerAt || item.questionAt || doc.updatedAt
    }));
  // 用户把别处找到的答案贴在批注下时，同样作为该文档的子节点展示。
  const replies = (Array.isArray(doc.annotations) ? doc.annotations : [])
    .filter((item) => item.type !== 'ai' && item.reply && String(item.reply).trim())
    .map((item) => ({
      requestId: item.id,
      question: item.note || item.question || item.quote || '未命名想法',
      kind: 'reply',
      parentRequestId: item.answerRequestId || undefined,
      updatedAt: new Date(item.replyAt || item.ts || doc.updatedAt).toISOString()
    }));
  const answerDocuments = [...answers, ...replies]
    .sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));
  return {
    documentId: doc.documentId,
    title: doc.title,
    fileName: doc.fileName,
    localPath: doc.localPath,
    updatedAt: doc.updatedAt,
    annotationCount: Array.isArray(doc.annotations) ? doc.annotations.length : 0,
    questionCount: messages.length,
    answerDocuments
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

function createRequestHandler({ store, staticDir, cors }) {
  const { readDocument, writeDocument, deleteDocument, upsertDocument, listDocuments } = store;
  const corsHeaders = cors
    ? {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    : {};

  function sendJson(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
    res.end(JSON.stringify(data));
  }

  function sendError(res, status, message) {
    sendJson(res, status, { error: message });
  }

  async function serveStatic(res, pathname) {
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes('..')) return sendError(res, 404, 'Not found');
    const filePath = resolve(join(staticDir, decoded === '/' ? 'index.html' : decoded));
    if (filePath !== resolve(staticDir) && !filePath.startsWith(resolve(staticDir) + sep)) {
      return sendError(res, 404, 'Not found');
    }
    try {
      const content = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': STATIC_TYPES[extname(filePath)] || 'application/octet-stream' });
      res.end(content);
    } catch {
      sendError(res, 404, 'Not found');
    }
  }

  async function handleChat(req, res) {
    const body = await readBody(req);
    const engine = normalizeEngine(body.engine);
    const doc = await upsertDocument(body.document || {});
    const requestId = randomUUID();
    // 在子文档视图里追问时，记下父节点，问答树才能逐级嵌套。
    const parentRequestId = typeof body.parentRequestId === 'string' && body.parentRequestId
      ? body.parentRequestId : undefined;
    const message = {
      requestId,
      engine,
      question: body.question || '',
      quote: body.selection?.quote || '',
      questionAt: new Date().toISOString(),
      parentRequestId,
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
      answerRequestId: parentRequestId,
      aiStatus: 'pending'
    }));
    await writeDocument(doc);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...corsHeaders
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

  return async function handleRequest(req, res) {
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
      if (parts[0] === 'api' && parts[1] === 'documents' && parts.length === 3 && req.method === 'DELETE') {
        await deleteDocument(parts[2]);
        return sendJson(res, 200, { ok: true });
      }
      if (parts[0] === 'api' && parts[1] === 'documents' && parts[3] === 'annotations' && req.method === 'DELETE') {
        const doc = await readDocument(parts[2]);
        doc.annotations = (doc.annotations || []).filter((item) => item.id !== parts[4] && item.requestId !== parts[4]);
        await writeDocument(doc);
        return sendJson(res, 200, { ok: true });
      }
      if (staticDir && req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        return serveStatic(res, url.pathname);
      }
      return sendError(res, 404, 'Not found');
    } catch (error) {
      return sendError(res, 500, error.message || String(error));
    }
  };
}

export function startAgentBridge({
  port = 0,
  host = '127.0.0.1',
  root = defaultWorkspaceRoot(),
  staticDir = '',
  cors = true
} = {}) {
  const store = createDocumentStore(root);
  const server = createServer(createRequestHandler({ store, staticDir, cors }));
  return new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(port, host, () => {
      const boundPort = server.address().port;
      resolvePromise({
        server,
        port: boundPort,
        url: `http://${host}:${boundPort}`,
        root,
        close: () => new Promise((done) => server.close(() => done()))
      });
    });
  });
}

// ===== CLI 入口 =====

async function verifyExistingBridge(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function runCli() {
  const port = Number(process.env.AGENT_BRIDGE_PORT || 4317);
  const root = defaultWorkspaceRoot();
  try {
    const bridge = await startAgentBridge({ port, root });
    console.log(`Agent Bridge listening on ${bridge.url}`);
    console.log(`Reading Workspace: ${root}`);
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      if (await verifyExistingBridge(port)) {
        console.log(`Agent Bridge already available on http://127.0.0.1:${port}`);
        process.exit(0);
      }
      console.error(`Port ${port} is already in use, but it does not look like Agent Bridge.`);
      process.exit(1);
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
