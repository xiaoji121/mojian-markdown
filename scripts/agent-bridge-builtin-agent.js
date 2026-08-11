// Vercel AI SDK ToolLoopAgent 的薄适配层：运行多步工具循环，把文本、
// 安全进度和聚合用量翻译成 Agent Bridge 能理解的结果。
import { ToolLoopAgent, stepCountIs } from 'ai';

const TOOL_LABELS = {
  read_current_document: '正在读取当前文档',
  read_project_file: '正在读取工程文件',
  list_project_files: '正在浏览工程文件',
  search_project_text: '正在搜索工程内容'
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
  const agent = new ToolLoopAgent({
    model,
    instructions: '你是墨笺 Markdown 的内置 Agent。优先使用提供的只读工具获取事实，不得声称执行了未提供的操作。',
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

