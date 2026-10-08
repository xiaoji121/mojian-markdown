# 测试体系与 Test-First 工作流

本项目采用两层测试。新增功能时**先写失败的测试，再写实现**（红 → 绿 → 重构）。

| 层 | 工具 | 位置 | 跑什么 |
| --- | --- | --- | --- |
| 单元测试 | Node 内置 `node:test`（零依赖，TS 直跑） | `tests/unit/*.test.ts` | 模块级逻辑：格式化命令、撤销历史、视图状态、存储、扩展转换 |
| 端到端 | Playwright + Chromium | `tests/e2e/*.spec.ts` | 真实浏览器中的用户链路：落地页 → 编辑 → 预览 → 持久化 |

## 命令速查

```bash
npm test                # 单元测试（快，秒级）
npm run test:watch      # 单元测试 watch 模式，TDD 时保持开着
npm run test:coverage   # 单元测试 + 覆盖率
npm run test:e2e        # 端到端测试（自动起 Vite dev server）
npm run test:e2e:ui     # Playwright UI 模式，调试 E2E 用
npm run check           # 提交前必跑：尺寸 + tsc + 单测 + 构建
npm run check:full      # check + E2E，改了用户可见行为时跑
```

首次运行 E2E 前需要安装浏览器：`npx playwright install chromium`。

## Test-First 工作流（新增功能时）

1. **定层**：这个行为能脱离浏览器验证吗？
   - 能（纯逻辑、DOM 操作可用 stub 表达）→ 写单元测试。
   - 不能（跨模块协作、真实渲染、键盘/滚动/持久化链路）→ 写 E2E；核心逻辑仍配单测。
2. **写红**：先写测试，跑一遍**确认它失败**且失败原因正是"功能还没实现"。
3. **写绿**：实现功能到测试通过为止，不多写。
4. **重构**：整理实现与测试，保持 `npm test` / `npm run test:e2e` 全绿。
5. **收尾**：跑 `npm run check`（改了 UI 链路则 `check:full`）。

## 单元测试怎么写

测试文件与被测模块同名：`src/editor/fooMethods.ts` → `tests/unit/fooMethods.test.ts`。

编辑器的方法类（`ViewMethods` 等）都以 `this` 上的 refs 为输入，测试时用**手工上下文对象**直接调用原型方法，不需要浏览器。共享的 DOM 替身在 `tests/helpers/dom.ts`：

- `createRef(value)` — React ref 形状 `{ current }`
- `createStubElement()` — 支持 attribute / classList / textContent / 事件监听的最小元素
- `createClassList()` — 独立的 classList 替身
- `createSourceStub(value, selStart, selEnd)` — textarea 替身（赋值移动光标到末尾，行为与真实一致）
- `installLocalStorageStub(initial?)` — 安装内存 localStorage，返回恢复函数

模板：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ViewMethods } from '../../src/editor/viewMethods.ts';
import { createRef, createStubElement } from '../helpers/dom.ts';

test('描述行为，而不是实现', () => {
  const preview = createStubElement();
  const context = { previewRef: createRef(preview), previewFullscreen: false };

  ViewMethods.prototype._syncPreviewEditable.call(context);

  assert.equal(preview.getAttribute('contenteditable'), 'false');
});
```

约定：

- 断言**行为结果**（值、属性、调用），不断言内部实现细节。
- stub 缺什么能力就往 `tests/helpers/dom.ts` 里补最小实现，不引入 jsdom。
- 测试之间不共享可变状态；改了全局（如 localStorage）必须在 `finally` 里恢复。

## 端到端测试怎么写

E2E 统一从 `tests/e2e/fixtures.ts` 导入 `test` / `expect`——该 fixture 会屏蔽外部网络请求（字体等），保证离线可复现。常用辅助：

- `openEditor(page)` — 直达 `/#editor` 并等待首屏渲染完成
- `setSource(page, markdown)` — 替换原文（走真实 input 事件）
- `selectInSource(page, text)` — 选中原文中一段文字，供工具栏命令使用

模板：

```ts
import { test, expect, openEditor, setSource } from './fixtures';

test('输入 Markdown 后预览实时渲染', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '# 标题');

  await expect(page.locator('.md-preview h1')).toHaveText('标题');
});
```

约定：

- 选择器优先级：`getByRole`（按钮有 aria-label 时）→ 稳定的语义 class（`.md-source`、`.md-preview`、`.view-mode-option[data-mode=…]`）。格式化按钮只有 `title`，用 `button[title="加粗"]`。
- 等待用 `expect(...).toHaveX` 自动重试或 `page.waitForFunction`，**不用** `waitForTimeout` 硬等。
- 每个测试是独立浏览器上下文，localStorage 天然干净；测持久化用 `page.reload()`。
- E2E 跑的是默认 Vite 模式（不含 Agent Bridge）。Bridge/AI 相关链路先用单测覆盖逻辑层。

## 基础设施位置

- `playwright.config.ts` — E2E 配置；自动起 `vite --port 4650`，并已处理本机全局代理（NO_PROXY 豁免 localhost）。
- `playwright.desktop.config.ts` — 桌面端（Electron）冒烟测试配置；`npm run test:desktop`，前置 `npm run build:bridge`。不进 CI 默认流程。
- `tests/helpers/dom.ts` — 单测 DOM 替身。
- `tests/e2e/fixtures.ts` — E2E fixture 与页面辅助函数。
- `tests/desktop/` — Electron 冒烟测试（`_electron.launch` 驱动真实桌面应用）。
- 测试目录不参与 `tsc --noEmit`（tsconfig 只含 `src`、`extension/src`），stub 可以写得宽松。

## 桌面安装包依赖与 Windows 验证

- `tests/unit/desktopPackaging.test.ts` 检查 bridge 的本地静态导入均在打包清单中，且生产依赖没有被排除；随 `npm test` 运行。
- `Windows desktop` CI 在 Windows x64 上运行现有桌面冒烟测试，并用 `electron-builder --win --x64 --dir --publish never` 生成未发布的应用目录。
- CI 将应用复制到仓库外的中文/空格路径，再通过 `MOJIAN_PACKAGED_EXECUTABLE` 启动 `tests/desktop/windows-packaged.spec.ts`：检查 bridge 健康、中文路径打开、写回、另存为、外部更新、重命名，以及重启后的文件授权。
- 另存为的原生对话框选择由测试替身提供，实际 IPC 与磁盘写入仍执行。该测试不覆盖 NSIS 安装/卸载、SmartScreen、签名或第三方 CLI 安装。
- 手动执行时先构建并打包，再设置 `MOJIAN_PACKAGED_EXECUTABLE` 为仓库外应用的 `.exe` 绝对路径，运行 `npx playwright test --config playwright.desktop.config.ts windows-packaged.spec.ts`。

## Desktop draft durability

- `tests/unit/desktopEditorState.test.ts` covers an atomic, versioned userData draft, strict non-secret UI-field allowlists, damaged-file/I/O preservation, validated IPC and close timeout/cancellation.
- `tests/unit/desktopStateMethods.test.ts` covers immediate final snapshots and safe file restoration; local-file/bridge unit tests also cover serialized pending writes.
- Shared `tests/desktop/restartScenarios.ts` runs in both source Electron and the isolated Windows executable: an unnamed draft with annotations/theme/font/AI channel, save-failure Stay/Retry, and linked files through repeated immediate window closes. Renderer timers are paused before the last input so these tests cannot accidentally wait out the autosave debounce.
- Desktop drafts are stored in `userData/editor-state.json`, independently of the randomized bridge port. The store intentionally excludes API settings and credentials. Existing browser/extension localStorage is unchanged. Old origin-local unnamed drafts cannot be automatically located; when no desktop draft exists, the existing recent-workspace fallback remains.
- Corrupted/unsupported draft files are retained and subsequent writes fail closed. Copy that file before manual recovery. A failed final save or unresolved linked-file conflict offers Stay (default) or an explicit exit with a loss warning.

## Windows AI CLI 协议验证（无账号）

- `npm run test:cli` 运行 shell-free 进程启动、Claude/Codex 协议、Gemini 本地 HTTP/SSE、飞书/钉钉连接器与开发入口测试。Linux CI 随完整单测执行；Windows desktop CI 在真实 Windows runner 上执行同一组测试。
- CLI fixture 使用独立的 `mojian-test-*` 命令、临时目录和仅含操作系统必需项的环境变量，不继承账号、HOME、token 或代理。Gemini 仅使用 loopback 服务与假 Key；测试在 socket 边界阻止非本机连接。
- Windows 覆盖 PATH/PATHEXT、npm `.cmd` shim、中文/空格路径、引号/换行/命令元字符原样传递、stdin、流式输出、非零退出、缺失命令，以及 `runEngine` 的 `timeoutMs` / `signal`。这两个选项是引擎 API 能力，本变更没有新增 UI 取消按钮或默认超时。
- 已知 npm Node shim 解析后直接运行 Node + JS 入口，始终 `shell: false`；任意 `.bat`、自定义或修改过的 `.cmd` 会安全拒绝。原生 `.exe` 继续直接启动。Electron 必须能找到 shim 同目录或 PATH 中的 `node.exe`，不会把桌面应用当作 Node 再启动。
- Windows 打包冒烟还会通过真实 `/api/chat` 调用 mock Claude/Codex shim，验证打包后的 Electron 能正确找到 Node 并传递提示词。开发入口直接启动 Vite 的 Node 入口，避免依赖 Node 自带的特殊 `npm.cmd` 包装器。
- 这些检查不验证真实 Claude/Codex 登录、服务端模型行为、Gemini Key、真实发布权限、任意包管理器 wrapper，或 Windows 10/11 的 NSIS 安装体验。启用超时/取消时，POSIX 使用独立进程组，Windows 使用系统 taskkill 终止普通子孙进程；测试包含 npm 风格的二级进程与继承的输出管道。终止失败会明确报错，不承诺终止工具自行脱离进程树的进程。

## Desktop credential tests

- `secureSettingsStore.test.ts`, `desktopCredentialStore.test.ts`, and boundary tests use injected fake crypto, fixed error strings and temporary workspaces. They cover consent-only migration, strict status, atomic failures, corruption, save/clear serialization, unsupported/locked storage and trusted-frame/capability checks.
- `credentialRedaction.test.ts` checks key redaction across streamed chunk boundaries. `desktopTestAiConnection.test.ts` injects a fake engine and proves response/error bodies do not return keys.
- `ai-settings.spec.ts` tests the desktop settings contract through a browser-only IPC mock, including disclosure and clearing hidden password inputs. `aiSettingsMethods.test.ts` covers interrupted/repeated operations and stale responses.
- `secureSettingsScenario.ts` runs in both source Electron and the isolated Windows package. It replaces OS safeStorage before any credential operation, uses fabricated keys, exercises the migration button, and checks save/clear/restart persistence. External Chromium traffic is directed to an unused loopback proxy; Node provider connections are loopback-guarded.
- Real Keychain/DPAPI integration and signed upgrades are not established by mocks. See [desktop credential security](DESKTOP_CREDENTIAL_SECURITY.md) for the exact boundary and limits.

## Optional AI first-run readiness

- `agentBridgeReadiness.test.ts` uses unique fake CLI names, isolated PATH, no real credentials and process-spawn guards. It checks POSIX permissions, Windows npm shim/Node resolution, safe status allowlists, locked/invalid settings and the desktop capability boundary. `/api/readiness` only reads local status/files, never invokes a CLI, decrypts a key, contacts a provider or claims login success.
- `aiReadinessMethods.test.ts` covers missing/offline/locked AI, late and overlapping status responses, preserved unsent questions, repeated clicks, close-during-check and Gemini-only translation. Engine selection continues using the stable desktop editor-state store from #22.
- Gemini connection testing is an explicit user action and may incur Google API usage. The persistent settings disclosure is separate from the result; field changes invalidate previous results. Tests cover fake loopback hung HTTP headers and SSE bodies and verify actual socket cancellation at the engine deadline, rather than just a rejected UI promise.
- `aiReadinessScenario.ts` runs in both source Electron and the isolated Windows package. The fake CLI writes a marker if accidentally invoked; readiness must never create it. The scenario covers a missing channel, continued file editing/write-through/preview, channel switching, rechecking and unverified login text without provider requests.
- This tranche depends on the merged persistence, shell-free CLI and desktop credential boundaries (#21–24). It does not install CLIs, log in, test live accounts, validate real Keychain/DPAPI, produce signed installers or authorize a release. Runtime launch/authentication can still fail after filesystem discovery; only an explicit question or Gemini test contacts a provider.
