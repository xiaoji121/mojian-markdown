// Agent 模式的三件事：工程上下文、提示词、会话续接与自愈。
// 从 agent-bridge.js 拆出，让服务端只管路由与 SSE，这里只管「一轮 agent 怎么跑」。
//
// 设计要点：
// ① 当前正文先落盘到工作区的 scratch 目录，并把路径告诉 agent。
//    这样「把这篇存到飞书」只需要读文件 + 调 CLI，不必给 agent 写文件权限。
// ② 工作目录 = 文档所属工程根，等价于用户在那个目录下敲 claude/codex。
// ③ 会话 id 按引擎存在文档记录上；resume 失败（会话文件被清理）就新建会话重试一次。
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runEngine } from './agent-bridge-engines.js';
import { projectRootFor } from './agent-bridge-project.js';

export async function prepareAgentContext({ root, doc, engine, env = process.env }) {
  const projectRoot = projectRootFor(doc.localPath);
  const scratchDir = join(root, 'scratch');
  await mkdir(scratchDir, { recursive: true });
  const scratchFile = join(scratchDir, `${doc.documentId}.md`);
  await writeFile(scratchFile, doc.content || '', 'utf8');
  return {
    projectRoot,
    cwd: projectRoot,
    scratchFile,
    // agent 读得到落盘正文（cwd 之外的目录需要显式授权）
    addDirs: [scratchDir],
    resumeSessionId: (doc.agentSessions && doc.agentSessions[engine]) || '',
    sessionId: randomUUID(),
    // 写文件默认不给；需要时用环境变量开（配套 UI 见 AGENT_CONNECTOR_PLAN.md 的 Phase 2）
    allowWrite: env.AGENT_BRIDGE_AGENT_ALLOW_WRITE === '1'
  };
}

function connectorHints(doc, context) {
  const name = (doc.fileName || '未命名.md').replace(/\.md$/i, '');
  return [
    '可用连接器（本机 CLI 已登录，直接用 Bash 调用，成功后把返回的链接原样回报）：',
    `- 存入飞书：lark-cli markdown +create --file "${context.scratchFile}" --name "${name}.md" --format json`,
    `- 存入钉钉：dws doc create --name "${name}" --content-file "${context.scratchFile}" --format json`
  ];
}

export function agentPrompt(body, doc, context) {
  const selection = body.selection || {};
  const resuming = !!context.resumeSessionId;
  const lines = [
    '你是墨笺 Markdown 的本地 Agent，运行在用户本机，可以调用工具真正把事做完。',
    '',
    `当前文档：${doc.fileName}`,
    `文档正文已落盘（要正文就读这个文件，不要凭记忆改写）：${context.scratchFile}`
  ];
  if (doc.localPath) lines.push(`文档原始路径：${doc.localPath}`);
  if (context.projectRoot) {
    lines.push(`所属工程根目录（也是你的工作目录，可读其中代码与说明文件获取上下文）：${context.projectRoot}`);
  }
  lines.push('', ...connectorHints(doc, context));
  lines.push(
    '',
    '规则：',
    '- 只做用户这次明确要求的事；把内容外发到飞书/钉钉属于「明确要求才做」。',
    '- 纯提问就直接回答，不必调用任何工具。',
    '- 做完用中文简短回报：做了什么、结果链接是什么。',
    ''
  );
  if (selection.quote) lines.push('用户选中的原文：', selection.quote, '');
  if (selection.surroundingText) lines.push('选中处上下文：', selection.surroundingText, '');
  // 首轮带全文建立共识；续接轮不再重复整篇，正文随时可从落盘文件读取。
  if (!resuming) lines.push('整篇文档：', doc.content || '', '');
  lines.push('用户问题：', body.question || '');
  return lines.join('\n');
}

// 跑一轮 agent。resume 失败且还没吐出任何内容时，重建会话重试一次并通知前端。
export async function runAgentTurn({ engine, prompt, context, env = process.env, onDelta, onSessionReset }) {
  let streamed = false;
  let captured = '';
  const run = (resumeSessionId, sessionId) => runEngine(engine, prompt, (delta) => {
    streamed = true;
    onDelta(delta);
  }, env, {
    mode: 'agent',
    cwd: context.cwd,
    addDirs: context.addDirs,
    allowWrite: context.allowWrite,
    sessionId,
    resumeSessionId,
    onSession: (id) => { captured = id; }
  });

  try {
    const answer = await run(context.resumeSessionId, context.sessionId);
    return { answer, sessionId: captured || context.resumeSessionId || context.sessionId };
  } catch (error) {
    // 已经流出内容就不能重来了（前端无法回退已渲染的片段），如实报错。
    if (!context.resumeSessionId || streamed) throw error;
    onSessionReset();
    const freshSessionId = randomUUID();
    const answer = await run('', freshSessionId);
    return { answer, sessionId: captured || freshSessionId };
  }
}
