// Vercel AI SDK ToolLoopAgent 的薄适配层：运行多步工具循环，把文本、
// 安全进度和聚合用量翻译成 Agent Bridge 能理解的结果。
import { ToolLoopAgent, stepCountIs } from 'ai';

const TOOL_LABELS = {
  read_current_document: '正在读取当前文档',
  read_project_file: '正在读取工程文件',
  list_project_files: '正在浏览工程文件',
  search_project_text: '正在搜索工程内容',
  replace_current_document: '正在准备当前文档修改'
};

function report(callback, label, state = 'running') {
  if (typeof callback === 'function') callback({ label, state });
}

export async function runBuiltinAgent({
  model,
  prompt,
  messages,
  tools,
  onDelta,
  onProgress,
  abortSignal,
  timeout = 120_000
}) {
  const canWriteCurrentDocument = !!tools?.replace_current_document;
  const agent = new ToolLoopAgent({
    model,
    instructions: [
      '你是墨笺 Markdown 的内置 Agent。优先使用工具获取事实，不得声称执行了未提供的操作。',
      canWriteCurrentDocument
        ? '修改当前文档时，必须先调用 read_current_document 获取最新 version，再把完整新正文和该 version 传给 replace_current_document；写入仍需用户逐次审批。若用户拒绝，不得重复请求同一修改。'
        : '本轮只允许读取，禁止声称修改了文档。'
    ].join('\n'),
    tools,
    stopWhen: stepCountIs(8)
  });
  const result = await agent.stream({
    ...(messages ? { messages } : { prompt }),
    abortSignal,
    timeout,
    onToolExecutionStart: ({ toolCall }) => {
      report(onProgress, TOOL_LABELS[toolCall.toolName] || '正在调用只读工具');
    },
    onToolExecutionEnd: ({ toolCall }) => {
      report(onProgress, TOOL_LABELS[toolCall.toolName] || '只读工具调用完成', 'done');
    }
  });
  let answer = '';
  for await (const delta of result.textStream) {
    answer += delta;
    if (typeof onDelta === 'function') onDelta(delta);
  }
  const usage = await result.usage;
  return {
    answer: answer.trim(),
    usage: {
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      totalTokens: usage.totalTokens || 0
    },
    responseMessages: await result.responseMessages
  };
}
