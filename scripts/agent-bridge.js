// Agent Bridge：本地阅读工作区 + AI 问答的 HTTP 服务。
// 两种使用方式：
//   CLI —— `node scripts/agent-bridge.js`，固定端口 4317，供 `npm run dev` 的网页版访问；
//   嵌入 —— Electron 桌面端 import { startAgentBridge }，随机端口 + 静态托管前端（同源，无需 CORS）。
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createDocumentStore, normalizeAnnotation } from './agent-bridge-store.js';
import { createSettingsStore, maskProviderSettings } from './agent-bridge-settings.js';
import { normalizeEngine, normalizeMode, runEngine } from './agent-bridge-engines.js';
import { createBuiltinModel } from './agent-bridge-providers.js';
import { createBuiltinAgentTools } from './agent-bridge-tools.js';
import { runBuiltinAgent } from './agent-bridge-builtin-agent.js';
import { agentPrompt, prepareAgentContext, readAgentDocumentUpdate, runAgentTurn } from './agent-bridge-agent.js';
import { importAgentMarkdownArtifacts } from './agent-bridge-artifacts.js';
import { connectorCapabilities, normalizeTarget, publishDocument } from './agent-bridge-connectors.js';
import {
  collectPathNodes,
  composePrompt,
  composedFileName,
  composedDocumentContent,
  normalizeComposeMode
} from './agent-bridge-compose.js';

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
      hiddenFromReadingTree: item.hiddenFromReadingTree === true,
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
      hiddenFromReadingTree: item.hiddenFromReadingTree === true,
      updatedAt: new Date(item.replyAt || item.ts || doc.updatedAt).toISOString()
    }));
  const allAnswers = [...answers, ...replies];
  const hidden = new Set(allAnswers.filter((item) => item.hiddenFromReadingTree).map((item) => item.requestId));
  let changed = true;
  while (changed) {
    changed = false;
    allAnswers.forEach((item) => {
      if (item.parentRequestId && hidden.has(item.parentRequestId) && !hidden.has(item.requestId)) {
        hidden.add(item.requestId);
        changed = true;
      }
    });
  }
  const answerDocuments = allAnswers
    .filter((item) => !hidden.has(item.requestId))
    .map(({ hiddenFromReadingTree, ...item }) => item)
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

function translatePrompt(text) {
  return [
    '你是翻译助手。请翻译下面这段文字：若其主要语言是中文，译成英文；否则译成中文。',
    '只输出译文本身，不要任何解释、注音或前后缀。',
    '',
    text
  ].join('\n');
}

function createRequestHandler({ store, settings, staticDir, cors, root, builtinModelFactory }) {
  const { readDocument, writeDocument, deleteDocument, upsertDocument, listDocuments } = store;
  const corsHeaders = cors
    ? {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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

  async function runChatEngine({ engine, body, doc, res }) {
    const engineOptions = engine === 'gemini'
      ? { gemini: await settings.providerSettings('gemini') }
      : {};
    return runEngine(
      engine,
      bridgePrompt(body, doc),
      (delta) => writeSse(res, 'delta', { text: delta }),
      process.env,
      engineOptions
    );
  }

  function isBuiltinAgentEngine(engine, mode) {
    return ['kimi', 'qwen', 'custom'].includes(engine) || (engine === 'gemini' && mode === 'agent');
  }

  function builtinMessages(doc, prompt, requestId) {
    const prior = (doc.messages || [])
      .filter((item) => item.requestId !== requestId && item.answer)
      .slice(-8)
      .flatMap((item) => [
        { role: 'user', content: item.question || '' },
        { role: 'assistant', content: item.answer || '' }
      ]);
    return [...prior, { role: 'user', content: prompt }];
  }

  async function runBuiltinChat({ engine, mode, body, doc, context, requestId, res }) {
    const providerSettings = await settings.providerSettings(engine);
    const model = builtinModelFactory(engine, providerSettings);
    const tools = mode === 'agent'
      ? createBuiltinAgentTools({ projectRoot: context?.projectRoot, scratchFile: context?.scratchFile })
      : {};
    const result = await runBuiltinAgent({
      model,
      messages: builtinMessages(doc, bridgePrompt(body, doc), requestId),
      tools,
      onDelta: (text) => writeSse(res, 'delta', { text }),
      onProgress: (item) => writeSse(res, 'progress', item)
    });
    writeSse(res, 'usage', result.usage);
    return result.answer;
  }

  // Agent 一轮：会话 id 写回文档，前端下次提问才能续上同一条对话线。
  async function runAgentChat({ engine, body, doc, context, res }) {
    const progress = [];
    const result = await runAgentTurn({
      engine,
      prompt: agentPrompt(body, doc, context),
      context,
      onDelta: (text) => writeSse(res, 'delta', { text }),
      onProgress: (item) => {
        progress.push(item);
        writeSse(res, 'progress', item);
      },
      onSessionReset: () => writeSse(res, 'session-reset', { documentId: doc.documentId })
    });
    if (result.sessionId) {
      doc.agentSessions = { ...(doc.agentSessions || {}), [engine]: result.sessionId };
    }
    return { answer: result.answer, progress };
  }

  async function handleChat(req, res) {
    const body = await readBody(req);
    const engine = normalizeEngine(body.engine);
    const mode = normalizeMode(body.mode);
    const builtinAgent = isBuiltinAgentEngine(engine, mode);
    const doc = await upsertDocument(body.document || {});
    const requestId = randomUUID();
    // 在子文档视图里追问时，记下父节点，问答树才能逐级嵌套。
    const parentRequestId = typeof body.parentRequestId === 'string' && body.parentRequestId
      ? body.parentRequestId : undefined;
    const message = {
      requestId,
      engine,
      mode,
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
    // Agent 模式：先备好工程上下文与落盘正文，再把会话续接情况告诉前端。
    const context = mode === 'agent'
      ? await prepareAgentContext({ root, doc, engine, allowWrite: body.allowWrite === true })
      : null;
    writeSse(res, 'meta', {
      requestId,
      engine,
      mode,
      documentId: doc.documentId,
      documentChars: doc.content.length,
      projectRoot: context?.projectRoot || '',
      writeAuthorized: !!context?.allowWrite,
      resumed: !!context?.resumeSessionId
    });

    try {
      const agentResult = context && !builtinAgent
        ? await runAgentChat({ engine, body, doc, context, res })
        : null;
      const answer = builtinAgent
        ? await runBuiltinChat({ engine, mode, body, doc, context, requestId, res })
        : agentResult
          ? agentResult.answer
          : await runChatEngine({ engine, body, doc, res });
      message.answer = answer;
      if (agentResult) message.progress = agentResult.progress;
      const updatedContent = context
        ? await readAgentDocumentUpdate(context, doc.content)
        : null;
      if (updatedContent !== null) {
        doc.content = updatedContent;
        message.documentUpdated = true;
        writeSse(res, 'document-updated', {
          documentId: doc.documentId,
          fileName: doc.fileName,
          content: updatedContent
        });
      }
      if (context && !builtinAgent) {
        message.artifacts = await importAgentMarkdownArtifacts(answer, context, upsertDocument);
        if (message.artifacts.length) writeSse(res, 'artifacts', { items: message.artifacts });
      }
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

  // 路径成文：把阅读脉络里选中的节点串成上下文，生成长文/二创并存为新文档。
  async function handleCompose(req, res) {
    const body = await readBody(req);
    const engine = normalizeEngine(body.engine);
    const mode = normalizeComposeMode(body.mode);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...corsHeaders
    });
    try {
      const documentId = String(body.documentId || '');
      let doc = null;
      try {
        if (/^[\w.-]+$/.test(documentId)) doc = await readDocument(documentId);
      } catch {}
      if (!doc) throw new Error('文档不存在，请回到阅读脉络重新发起');
      const nodes = collectPathNodes(doc, body.requestIds);
      if (!nodes.length) throw new Error('所选节点在该文档中不存在，请回到阅读脉络重新选择');
      writeSse(res, 'meta', { documentId: doc.documentId, engine, mode, nodeCount: nodes.length });
      const engineOptions = engine === 'gemini'
        ? { gemini: await settings.providerSettings('gemini') }
        : {};
      const prompt = composePrompt({ doc, nodes, mode, instruction: body.instruction });
      const answer = await runEngine(engine, prompt, (delta) => {
        writeSse(res, 'delta', { text: delta });
      }, process.env, engineOptions);
      const fileName = composedFileName(doc, mode);
      const composed = await upsertDocument({
        sourceApp: 'markdown-editor',
        title: fileName,
        fileName,
        content: composedDocumentContent(answer, { doc, nodes, mode })
      });
      writeSse(res, 'done', { composedDocumentId: composed.documentId, fileName: composed.fileName });
    } catch (error) {
      writeSse(res, 'error', { message: error.message || String(error) });
    } finally {
      res.end();
    }
  }

  // 一键发布：把当前文档交给本机已登录的飞书/钉钉 CLI 建成在线文档，回链写进文档记录。
  // 这条是确定性路径 —— 不让大模型来决定「有没有正确调用 CLI」。
  async function handlePublish(req, res) {
    const body = await readBody(req);
    const target = normalizeTarget(body.target);
    let doc = null;
    if (body.documentId) {
      if (!/^[\w.-]+$/.test(String(body.documentId))) throw new Error('文档不存在，请先保存后再发布');
      try {
        doc = await readDocument(String(body.documentId));
      } catch {
        throw new Error('文档不存在，请先保存后再发布');
      }
    } else {
      doc = await upsertDocument(body.document || {});
    }
    const result = await publishDocument(target, {
      fileName: doc.fileName,
      content: doc.content,
      folder: body.folder || ''
    });
    const publication = {
      target: result.target,
      label: result.label,
      name: result.name,
      url: result.url,
      at: new Date().toISOString()
    };
    doc.publications = [...(doc.publications || []), publication];
    await writeDocument(doc);
    return sendJson(res, 200, { ok: true, documentId: doc.documentId, ...publication });
  }

  // 连通性验证：优先用请求里的 Key/模型（保存前先测），缺省回落到已保存配置。
  async function handleSettingsTest(req, res) {
    const body = await readBody(req);
    const provider = ['gemini', 'kimi', 'qwen', 'custom'].includes(body.provider) ? body.provider : 'gemini';
    const saved = await settings.providerSettings(provider);
    const incoming = body?.[provider] || {};
    const config = {
      apiKey: incoming.apiKey || saved.apiKey,
      model: incoming.model || saved.model,
      baseURL: incoming.baseURL || saved.baseURL,
      proxy: incoming.proxy || saved.proxy
    };
    let timer = null;
    try {
      const reply = await Promise.race([
        provider === 'gemini'
          ? runEngine('gemini', '连通性测试：请只回复 OK', () => {}, process.env, { gemini: config })
          : runBuiltinAgent({
              model: builtinModelFactory(provider, config),
              prompt: '连通性测试：请只回复 OK',
              tools: {}, onDelta: () => {}
            }).then((result) => result.answer),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('验证超时（15 秒），请检查网络或模型名')), 15_000);
        })
      ]);
      return sendJson(res, 200, { ok: true, provider, model: config.model, reply: String(reply).slice(0, 80) });
    } catch (error) {
      return sendJson(res, 200, { ok: false, message: error.message || String(error) });
    } finally {
      clearTimeout(timer);
    }
  }

  // 划词翻译：走用户自配的 Gemini Key，流式 SSE 返回译文。
  async function handleTranslate(req, res) {
    const body = await readBody(req);
    const text = String(body.text || '').trim();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...corsHeaders
    });
    try {
      if (!text) throw new Error('没有可翻译的文字');
      const gemini = await settings.providerSettings('gemini');
      writeSse(res, 'meta', { provider: 'gemini', model: gemini.model });
      const answer = await runEngine('gemini', translatePrompt(text), (delta) => {
        writeSse(res, 'delta', { text: delta });
      }, process.env, { gemini });
      writeSse(res, 'done', { text: answer });
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
      if (req.method === 'GET' && url.pathname === '/api/connectors') {
        return sendJson(res, 200, await connectorCapabilities(process.env));
      }
      if (req.method === 'GET' && url.pathname === '/api/settings') {
        return sendJson(res, 200, maskProviderSettings(await settings.readSettings()));
      }
      if (req.method === 'POST' && url.pathname === '/api/settings') {
        const body = await readBody(req);
        return sendJson(res, 200, maskProviderSettings(await settings.updateProviders(body)));
      }
      // 下面这些委派处理器都是异步的，必须 await：直接 return promise 的话，
      // 它们抛出的错误（如请求体 JSON 解析失败、发布目标不支持）会绕过本函数的
      // catch 变成未处理的 rejection —— 客户端永远等不到响应，进程还可能被拖死。
      if (req.method === 'POST' && url.pathname === '/api/settings/test') return await handleSettingsTest(req, res);
      if (req.method === 'POST' && url.pathname === '/api/translate') return await handleTranslate(req, res);
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
      if (req.method === 'POST' && url.pathname === '/api/chat') return await handleChat(req, res);
      if (req.method === 'POST' && url.pathname === '/api/publish') return await handlePublish(req, res);
      if (req.method === 'POST' && url.pathname === '/api/compose') return await handleCompose(req, res);
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
      if (parts[0] === 'api' && parts[1] === 'documents' && parts[3] === 'answers'
        && parts.length === 5 && req.method === 'PATCH') {
        const body = await readBody(req);
        const doc = await readDocument(parts[2]);
        const targets = [
          ...(doc.messages || []).filter((item) => item.requestId === parts[4]),
          ...(doc.annotations || []).filter((item) => item.id === parts[4] || item.requestId === parts[4])
        ];
        if (!targets.length) return sendError(res, 404, '问答不存在');
        targets.forEach((item) => { item.hiddenFromReadingTree = body.hiddenFromReadingTree !== false; });
        await writeDocument(doc);
        return sendJson(res, 200, { ok: true, hiddenFromReadingTree: body.hiddenFromReadingTree !== false });
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
  cors = true,
  builtinModelFactory = createBuiltinModel
} = {}) {
  const store = createDocumentStore(root);
  const settings = createSettingsStore(root);
  const server = createServer(createRequestHandler({
    store, settings, staticDir, cors, root, builtinModelFactory
  }));
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
