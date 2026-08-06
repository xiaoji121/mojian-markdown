# AI 助手 Agent 化 + 飞书/钉钉连接器：可行性与方案

来源：2026-08-06 妙记《墨剑Markdown产品功能规划》（minute_token `obcn917k257to1t25fgimm71`）。
两个诉求：

1. 把「AI 问答」升级成具备 agent loop 的「AI Agent」，能替我做事（例如把当前 Markdown 存进飞书/钉钉文档），并且能接上「产出这篇文档时的那个工程上下文」，不再手工来回复制粘贴。
2. 集成钉钉/飞书 CLI 做连接器，把沉淀的内容一键上传成在线文档，借它们现成的承载与分享能力对外分享。

## 一、可行性结论（均在本机实测，非推断）

### 1.1 不需要自己写 agent loop —— 现有两个渠道本身就是 agent

`claude -p` 与 `codex exec` 都不是「文本补全接口」，而是完整的 agent loop（自带 Read/Write/Bash/Grep 等工具、多轮工具调用、最终产出回答）。当前 bridge 只是**主动把它们关进了笼子**：

| 现状（`agent-bridge-engines.js`） | 后果 |
| --- | --- |
| `claude -p <prompt>`，默认权限模式 | 需要授权的工具在非交互下被拒，等于只会说话不会做事 |
| `codex exec --sandbox read-only --ephemeral` | 只读 + 不落盘会话，既不能写也无法续接 |
| 子进程不设 `cwd` | 跑在应用目录里，看不到文档所属工程 |

所以「升级成 Agent」的本质不是造轮子，而是**按需解开这三处限制**。实测证据：

```bash
# 工具白名单在非交互模式下确实生效（提示词走 stdin，避免与可变参数冲突/argv 长度上限）
echo "运行 lark-cli auth status，只回复其中 brand 字段的值" \
  | claude -p --allowedTools "Bash(lark-cli auth status:*)"
# → feishu   （真的执行了 CLI，不是幻觉）
```

### 1.2 「接上产出这篇文档的上下文」可行，且有两条路都实测通过

**路 A：续接同一个会话（严格意义的「接着聊」）**

```bash
claude --session-id 55407873-… -p "记住这个数字：4317。只回复 OK"   # → OK
claude --resume     55407873-… -p "我刚让你记住的数字是多少？"      # → 4317
```

```bash
codex exec --json … "记住数字 4317"
# → {"type":"thread.started","thread_id":"019fd731-38c8-7373-bff4-99c171e29e2b"}
codex exec resume 019fd731-… --json "我让你记住的数字是多少？"       # → 4317
```

即：**只要我们持久化会话 id，就能把每篇文档变成一条持续生长的对话线**，问答不再是一次性的。
注意 `codex exec resume` 不接受 `-C/--cd` 与 `--sandbox`，工作目录只能靠子进程 `cwd`、沙箱只能用 `-c sandbox_mode=…` 覆盖。

**路 B：连到工程目录（等价于「在那个目录下敲 claude」）**

给子进程设 `cwd` = 文档所在工程根（`claude --add-dir` / `codex -C`），agent 立刻获得该工程的 CLAUDE.md、代码、git 状态。
我们已经有现成的钩子：文档记录里本来就存了 `localPath`（`agent-bridge-store.js`），向上找 `.git`/`package.json`/`CLAUDE.md`/`AGENTS.md` 即可定位工程根。

> 关于「接上另一个 App（Claude Code / Codex 客户端）里那次会话」：技术上 `~/.claude/projects/<escaped-cwd>/*.jsonl` 与 codex 的 session 文件都在本机，理论上可以扫出来让用户挑。但那是**别的进程写的私有格式**，跨版本会漂。
> 结论：不做格式逆向。路 A（我们自己发起、自己持久化 id）+ 路 B（同一工程目录，agent 自己去读工程）已经覆盖了诉求，且稳定。

### 1.3 两个连接器 CLI 都已就位

本机已安装且已登录：

- `lark-cli` → 身份 `feishu` / 予希（user + bot 均 ready）
- `dws` → 予希智育工作室（token 有效）

关键能力：

| 目标 | 命令 | 备注 |
| --- | --- | --- |
| 飞书建 Markdown 文档 | `lark-cli markdown +create --file <f> --name <n>` | 该 shortcut **自带**回查真实访问 URL（内部 `metas/batch_query`），一步拿到链接 |
| 飞书公开分享 | `lark-cli drive permission.public patch` | 存在此资源；权限策略受企业管控，作为独立可选步骤 |
| 钉钉建文档 | `dws doc create --name <n> --content-file <f>` | 支持 markdown 原生内容，长文用 `--content-file` 避免转义 |

### 1.4 两个只有真机联调才会暴露的坑（已在实现里处理）

1. **`lark-cli` 拒收绝对路径**：`--file /var/folders/.../document.md` 直接报
   `unsafe file path: --file must be a relative path within the current directory`。
   → 连接器在正文落盘的暂存目录里启动子进程，`--file` 传 `./document.md`。
   `dws` 无此限制（绝对路径实测可用），故按目标区分（`relativeFile` 开关）。
2. **`dws doc create` 不认 `--dry-run`**：该 flag 在全局帮助里写着「预览操作内容，不实际执行」，
   但 `doc create` 会忽略它并**真的建出文档**（实测建成后已移入回收站）。
   → 不要用 `--dry-run` 对 `dws` 的写操作做演练；要演练就用假 CLI（单测里的做法）。
3. **成功标记不同名**：`lark-cli` 用 `ok`，`dws` 用 `success`。两者都要判，否则失败会被当成成功。

## 二、方案设计

### 2.1 两条路径并存（关键设计决策）

同一个诉求「把这篇存到飞书」有两种实现，**都要，各管一段**：

- **确定性路径（连接器）**：`/api/publish` 直接 spawn CLI。可预期、可测、失败信息明确。适合「一键发布」这种高频动作 —— 不该每次都赌大模型愿意正确调用 CLI。
- **柔性路径（Agent）**：把 `Bash(lark-cli:*)`/`Bash(dws:*)` 放进工具白名单，用户可以用自然语言表达组合动作（「把这篇存到飞书，再把链接贴到钉钉群」）。

### 2.2 模式切换：问答 / Agent

AI 面板加一枚 `问答 | Agent` 开关，默认 **问答**（与今天行为完全一致，零回归）：

| | 问答模式（默认） | Agent 模式 |
| --- | --- | --- |
| 工具 | 无 | 白名单：Read/Glob/Grep + `lark-cli`/`dws`；「允许写文件」另开则加 Write/Edit |
| 工作目录 | 不设 | 文档所属工程根 |
| 会话 | 一次性 | 按文档持久化，续接 |
| 沙箱（codex） | `read-only` | `workspace-write` |

权限最小化：白名单只给这次功能真正需要的东西，写文件是**独立开关**，默认关。

### 2.3 会话持久化与失效自愈

会话 id 存在文档记录上：`doc.agentSessions = { claude: '<uuid>', codex: '<thread_id>' }`。

首轮 `--session-id <新 uuid>` / 记录 `thread.started`；后续 `--resume <id>`。
会话文件被清理时 resume 会失败 → **自动降级为新会话重试一次**，并向前端发 `session-reset` 事件（前端 `aiMethods.ts` 早已能处理这个事件与 `meta.resumed` 字段，此前只是服务端从未发出）。

### 2.4 发布记录回写

发布结果写回文档：`doc.publications = [{ target, url, title, at }]`，前端展示「已发布 · 打开链接」，避免同一篇反复建重复文档。

## 三、分期

**Phase 1（本次实现）**

- `agent-bridge-project.js`：`localPath` → 工程根定位。
- `agent-bridge-engines.js`：agent 模式调用矩阵（工具白名单 / cwd / 会话新建与续接 / codex `--json` 捕获 thread_id），提示词一律走 stdin。
- `agent-bridge-connectors.js`：飞书/钉钉发布，URL 防御式解析。
- bridge：`/api/chat` 支持 `mode: 'agent'`、持久化会话、`session-reset` 自愈；新增 `/api/publish`。
- 前端：AI 面板模式开关 + 工程上下文提示；文件菜单「分享到飞书/钉钉」+ 回链。

**Phase 2（后续）**

- 工具调用轨迹可视化（`claude --output-format stream-json` / codex `--json` 的 `command_execution` 事件流式渲染成「正在执行 lark-cli …」）。
- Agent 产出的 `.md` 一键在墨笺打开（agent 写文件 → bridge 监听 → 前端弹「打开」）。
- 飞书公开分享开关（`permission.public patch`）+ 企业策略失败提示。
- 会话选择器：列出本机 claude/codex 在该工程下的历史会话供挑选（依赖私有格式，需容错）。

## 四、风险与边界

| 风险 | 处置 |
| --- | --- |
| Agent 拿到 Bash 后越权 | 白名单精确到命令前缀；写文件独立开关默认关；codex 仍在 `workspace-write` 沙箱内 |
| 打包版 GUI 启动 PATH 缺失导致 spawn 失败 | 已在 `DESKTOP_ROADMAP.md` 1.3 记录；连接器与 agent 都依赖它，优先级应提升 |
| CLI 未登录/企业禁用外发 | 发布失败按原样透出 CLI stderr，不吞错 |
| CLI 输出结构变动 | URL 解析用「递归找第一个 http 链接」的防御式策略，而非绑定字段路径 |
| 内容外发到企业云 | 发布是显式动作（菜单点击 / agent 明确指令），不做任何自动上传 |
