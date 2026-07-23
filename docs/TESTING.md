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
- `tests/helpers/dom.ts` — 单测 DOM 替身。
- `tests/e2e/fixtures.ts` — E2E fixture 与页面辅助函数。
- 测试目录不参与 `tsc --noEmit`（tsconfig 只含 `src`、`extension/src`），stub 可以写得宽松。
