# 桌面端公开发布路线图

目标：把 `agent/desktop-electron` 分支上的桌面端，从「自己机器上能跑的构建」变成「任何人下载即用的 Windows / macOS 软件」。

现状（2026-07）：Electron 桌面端已实现内嵌 Agent Bridge、原生文件双向同步、`.md` 文件关联与冒烟测试；仅在 macOS (arm64) 上构建与验证过，未签名，AI 依赖本机 CLI。

按「挡路程度」分三个阶段。每项标注工作量：S（半天内）/ M（1–2 天）/ L（3 天以上或有外部流程）。

## 阶段一：分发硬门槛（不做就装不上 / 一用就坏）

### 1.1 Windows 构建与应用图标 · M
- [ ] `desktop/electron-builder.yml` 增加 Windows NSIS 目标（x64 + arm64）
- [ ] macOS 补 Intel 支持（x64 双构建或 universal）
- [ ] 设计并接入应用图标（`.icns` / `.ico`，当前是 Electron 默认图标）
- 验收：两平台安装包可安装、可启动、图标正确。

### 1.2 代码签名与公证 · L（外部流程，最先启动）
- [ ] 申请 Apple Developer（$99/年）→ Developer ID Application 证书（账号侧任务）
- [ ] electron-builder 接入 macOS 签名 + notarization（notarytool）
- [ ] Windows 签名：优先 Azure Trusted Signing（约 $10/月），或传统 OV/EV 证书
- 验收：macOS 双击直接打开无 Gatekeeper 拦截；Windows 安装无红色 SmartScreen 警告（信誉需时间积累，黄色提示可接受）。
- 备注：申请与审核周期比开发久，**应立即启动**；自动更新（2.3）依赖签名。

### 1.3 GUI 启动时的 PATH 修复 · M（当前打包版 AI 实际不可用）
- 问题：Finder/Dock 启动的应用只继承 launchd 最小 PATH，`spawn('claude')` ENOENT；此前冒烟从终端启动，未暴露。
- [ ] 主进程启动时探测登录 shell 的 PATH（`$SHELL -ilc 'echo $PATH'` 思路），注入 bridge 子进程环境
- [ ] 提供手动指定 CLI 路径的设置入口（复用 `AGENT_BRIDGE_{CLAUDE,CODEX}_COMMAND`）
- 验收：从 Finder 双击启动打包版，AI 问答可用。

### 1.4 Windows 的 CLI 调用兼容 · S
- 问题：npm 全局命令在 Windows 是 `claude.cmd`，`spawn` 不带 shell 找不到。
- [ ] `scripts/agent-bridge-engines.js` 按平台处理（`shell: true` 或解析 `.cmd` 完整路径），补单测
- 验收：Windows 上 AI 问答可用。

### 1.5 外链转系统浏览器 · S
- 问题：预览外链走 `window.open(_blank)`（viewMethods.ts），Electron 会开一个裸 BrowserWindow 加载外站。
- [ ] 主进程 `setWindowOpenHandler` + `will-navigate` 守卫 → `shell.openExternal`
- 验收：点外链打开系统浏览器，应用窗口不跳转；桌面冒烟补断言。

### 1.6 字体分发合规 · S
- 问题：LICENSING.md 明确仓耳今楷不可随意再分发；打包机器跑过 `font:fetch` 时字体会进安装包。
- [ ] `build:desktop` 默认剔除 `dist/fonts` 中的仓耳字体（除非明确取得再分发许可）
- [ ] 验证无字体时回退系统楷体（macOS Kaiti SC / Windows KaiTi，字体栈已含）渲染正常
- 验收：安装包内不含仓耳字体文件，两平台界面正常。

## 阶段二：产品化（普通用户用得顺）

### 2.1 无 AI 的首次运行体验 · M
- [ ] 启动时检测 CLI 可用性，AI 面板给出友好引导（装什么、怎么登录、不装也能用什么）
- [ ] 确保 AI 缺失时所有非 AI 功能零感知可用（架构已支持，补引导文案与 E2E）

### 2.2 API Key 直连模式（产品决策，可选）· L
- 让不装 CLI 的普通用户也能用 AI：bridge 增加 Anthropic API 引擎，设置界面录入 Key（`safeStorage` 加密存储）。
- 决策点：是否要承担「用户自带 Key」的支持成本；托管服务（账号/计费）明确不在本阶段。

### 2.3 自动更新 · M
- [ ] electron-updater + GitHub Releases，随签名一起落地
- 验收：旧版本启动后能发现新版本并完成更新。

### 2.4 发布流水线 · M
- [ ] GitHub Actions 矩阵构建（macos + windows runner），打 tag 自动出安装包传 Release
- [ ] Windows runner 至少跑单测 + 桌面冒烟（目前只在 macOS 验证过）
- [ ] 版本号策略与更新日志（从 1.0.0 起步）

### 2.5 桌面惯例细节 · M
- [ ] 关闭窗口时未保存确认（当前靠 localStorage 草稿兜底）
- [ ] 窗口大小/位置记忆
- [ ] macOS「最近使用的文档」系统菜单（`app.addRecentDocument`）
- [ ] 拖 `.md` 文件进窗口打开

### 2.6 下载页 · S
- [ ] 官网（yuxizhai.com/md-editor）加桌面端下载入口、系统要求、更新日志

## 阶段三：规模化后再做

- 崩溃上报与日志收集（隐私权衡，需用户同意机制）
- i18n（界面目前全中文；看是否面向非中文用户）
- Linux 包（AppImage / deb）
- 商业与许可备忘：Mac App Store 走不通（沙箱禁止 spawn 外部 CLI），官网直发是既定路线；代码为 PolyForm Noncommercial，版权人自行分发不受限。

## 建议执行顺序

1. **立即**：启动 1.2 的证书申请（纯等待时间最长）。
2. **第一批代码**：1.3 → 1.4 → 1.5 → 1.6（都是小改动，且 1.3 修的是现有 bug）。
3. **第二批**：1.1（有了图标与双平台构建，配合证书到位即可出第一个公开版本）。
4. **发布基建**：2.3 + 2.4（决定后续迭代成本），然后 2.1、2.5、2.6。
5. 2.2 视产品定位单独决策。

里程碑：
- **M1 可安装**：阶段一全部完成 → 两平台可下载安装、核心功能无损。
- **M2 可迭代**：2.3 + 2.4 → 发版自动化，用户可自动升级。
- **M3 面向大众**：2.1 + 2.5 + 2.6 → 非开发者用户可顺畅上手。
