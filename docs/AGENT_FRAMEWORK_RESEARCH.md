# 墨笺 Markdown 内置 Agent 框架调研报告

> 调研日期：2026-08-11  
> 需求来源：飞书妙记《墨剑Markdown产品agent框架调研》  
> 本轮范围：技术调研与选型，不实施代码

## 1. 结论

墨笺可以内置一套不依赖 Codex CLI、Claude Code CLI 的 Agent，并让用户自行配置 Kimi、通义千问、Gemini 或其他兼容接口的 API Key。

推荐方案是：

1. **Agent loop 采用 Vercel AI SDK 的 `ToolLoopAgent`**。
2. **模型接入分为原生 provider 与 OpenAI-compatible provider 两类**：Gemini 使用原生 Google provider；Kimi、通义千问等优先使用 OpenAI-compatible 接口。
3. **运行位置保持在现有 Node Agent Bridge / Electron 主进程侧**，不在浏览器渲染进程保存 API Key 或执行工具。
4. **现有 Codex、Claude CLI 继续作为“高级本地 Agent”选项**，新内置 Agent 是面向普通用户的默认通用通道，二者不互相替代。

这条路线对现有代码侵入最小：项目已经具备 SSE 流式响应、AI 面板、按文档会话、工程上下文、工具授权和 Agent Bridge，缺少的主要是一个“API 模型 + tool loop”的引擎实现。

## 2. 需求拆解

妙记里的真实需求不是通用的多 Agent 平台，而是一个嵌入 Markdown 编辑器的单 Agent：

- 自带多轮 Agent loop；
- 自带并复用墨笺现有交互界面；
- 能读取当前文档、选区和有限的工程上下文；
- 经用户确认后可修改当前文档或调用发布连接器；
- 用户只需 API Key，不要求安装 CLI；
- 中国大陆网络和模型供给可用；
- 框架轻量，适配当前 TypeScript、Node、Electron 架构；
- 后续可增加模型、工具、会话与 MCP，但本期不需要多 Agent 编排平台。

因此，选型权重依次是：嵌入成本、provider 可替换性、tool loop 与流式事件、权限可控、包体与复杂度，最后才是多 Agent、工作流、云端观测等平台能力。

## 3. 候选框架对比

| 方案 | 优点 | 主要代价 | 与墨笺匹配度 |
| --- | --- | --- | --- |
| **Vercel AI SDK `ToolLoopAgent`** | TypeScript 原生；API 小；流式、工具调用、停止条件、结构化输出完整；原生多 provider；可配置任意 OpenAI-compatible `baseURL` | 会话持久化、审批策略、文件沙箱需要产品自己实现 | **最高，推荐** |
| **Mastra** | TypeScript；Agent、Memory、Workflow、MCP、日志、评测更完整；适合快速搭建独立 Agent 后端 | 引入的平台概念和依赖更多；部分企业能力采用单独许可；与现有 bridge、会话、UI 能力重叠 | 中高，未来复杂化时备选 |
| **LangChain.js / LangGraph.js** | provider 与集成生态广；图状态、checkpoint、人工介入成熟；复杂流程表达力强 | 抽象层较多、学习和升级成本高；对本期单 Agent 属于过度设计 | 中，复杂图工作流再考虑 |
| **OpenAI Agents SDK JS** | 核心轻量；工具、handoff、guardrail、session、MCP 完整；官方支持自定义 `ModelProvider`，也可通过 AI SDK 适配其他模型 | 默认心智和最佳路径仍偏 OpenAI；为 Kimi/千问接入往往仍要再接 AI SDK 或维护 provider 适配 | 中高，但不如直接采用 AI SDK 简洁 |
| **自行写 while-loop** | 依赖最少、完全可控 | 要自行处理工具调用协议、流式拼接、停止条件、重试、消息裁剪、不同 provider 差异；维护风险最高 | 低，不建议 |

### 为什么首选 AI SDK

AI SDK 的 `ToolLoopAgent` 已经覆盖本需求最关键的 Agent 循环：模型选择工具、执行工具、把结果送回模型、继续迭代，直到得到最终回答或触发停止条件。默认步数上限可配置，还提供逐步回调和工具调用事件，适合映射到墨笺现有的 Agent 进度 UI。

它的 OpenAI-compatible provider 支持自定义 `baseURL`、API Key、请求头、请求体转换、流式工具调用与结构化输出。这意味着模型渠道不是写死的：只要供应商的兼容接口确实支持 tool calling，就可被同一套 Agent loop 使用。

需要强调：**“兼容 OpenAI API”不等于“完整兼容 Agent”**。每个模型仍需实测流式 tool call、参数 JSON、并行工具调用、长上下文和错误格式。不能仅凭 Chat Completions 能返回文本就宣称支持。

## 4. 国内模型接入判断

### Kimi / Moonshot

采用 Moonshot/Kimi 官方提供的 API，并通过其 OpenAI-compatible 形态接入。设置项至少包括 `apiKey`、`baseURL`、`modelId`。具体可用模型名和工具调用能力应在发布时从官方文档/模型列表校验，不写死在产品代码里。

### 通义千问 / 阿里云百炼

采用阿里云百炼的 OpenAI 兼容接口。国内与国际站点可能具有不同 endpoint，用户选择区域后由产品填写默认 `baseURL`，仍允许高级用户覆盖。模型是否支持 function/tool calling 必须进入兼容性白名单。

### Gemini

保留原生 Google provider，而不是强行转成 OpenAI-compatible。当前项目已有 Gemini SSE 实现，可以在迁移期继续工作；待新引擎稳定后统一到 provider 层，减少手写 SSE 协议维护。

### 自定义兼容接口

提供“自定义 OpenAI-compatible”入口，允许用户填写 `baseURL`、`modelId`、API Key。默认只开放聊天；通过一次自动能力探测后，才允许启用 Agent 模式。探测应实际调用一个无副作用的测试工具，而不是只检查 `/models`。

## 5. 与现有项目的适配性

当前代码已经完成了大部分外围能力：

- `scripts/agent-bridge-engines.js`：Claude、Codex、Gemini 引擎抽象与流式处理；
- `scripts/agent-bridge-agent.js`：工程根、当前文档副本、Agent prompt、会话恢复；
- `scripts/agent-bridge-store.js`：文档、历史与会话数据；
- `src/editor/aiMethods.ts`：SSE 消费、进度、重试、文档回写；
- `src/editor/aiSettingsMethods.ts`：模型渠道与 API Key 配置界面；
- 已有按请求确认项目工具/写入权限的交互。

因此无需新建一套前后端框架。新增内置 Agent 应作为第四种 engine 接入现有 bridge，在服务端把 AI SDK 的文本流、tool-call、tool-result、finish、error 事件翻译为现有 SSE 事件。

## 6. 风险与限制

| 风险 | 建议措施 |
| --- | --- |
| API Key 泄漏 | 不传到渲染进程；Electron 用系统安全存储，Web 开发模式只存 bridge 本机配置；日志永不输出密钥 |
| 模型误用写工具 | 读写工具分离；写工具每次请求显式授权；真正执行前再做服务端策略校验 |
| 无限循环和费用失控 | 设置最大步数、单轮 token/费用预算、超时、AbortSignal；UI 提供停止按钮 |
| provider “兼容但不完整” | 建立模型能力白名单和自动探测；聊天可用不代表 Agent 可用 |
| 文件系统越权 | 不提供任意 shell；工具使用结构化参数、规范化路径、限定工程根与 scratch 文件 |
| 上下文越来越长 | 按文档持久化消息；超过阈值时摘要旧消息，但保留工具结果与用户确认记录 |
| 包体与启动时间 | 只引入 `ai`、所需 provider 和 schema 库，不引入完整平台或无关 provider |
| 许可变化 | 锁定依赖版本，发布前复核依赖许可证；Mastra 若采用需排除 `ee/` 企业许可代码 |

## 7. 最终建议

现在就按 **AI SDK + 自有安全工具层 + 现有墨笺 UI/Bridge** 设计，不引入 Mastra 或 LangGraph。

当未来出现以下任一需求时，再评估 Mastra/LangGraph：跨 Agent 协作、可视化长流程、持久化图状态、后台定时任务、复杂人工审批链、系统级 tracing/eval。当前为了这些未来可能性提前引入平台，会增加包体和维护面，却不能明显改善首版用户体验。

## 8. 主要资料

- [AI SDK：Agents 概览](https://ai-sdk.dev/docs/agents/overview)
- [AI SDK：ToolLoopAgent API](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- [AI SDK：OpenAI-compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers)
- [AI SDK：Provider 管理](https://ai-sdk.dev/docs/ai-sdk-core/provider-management)
- [Vercel AI SDK GitHub](https://github.com/vercel/ai)
- [Mastra Agents 概览](https://mastra.ai/docs/agents/overview)
- [Mastra GitHub 与许可说明](https://github.com/mastra-ai/mastra)
- [LangChain.js Agents](https://docs.langchain.com/oss/javascript/langchain/agents)
- [OpenAI Agents SDK JS：Models 与自定义 provider](https://openai.github.io/openai-agents-js/guides/models/)
- [OpenAI Agents SDK JS GitHub](https://github.com/openai/openai-agents-js)

