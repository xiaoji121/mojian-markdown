# 墨笺 Markdown

一个面向阅读、学习和评注的 Markdown 编辑器：直接编辑、实时预览、双向定位、划线批注、本地缓存与导入导出。可选接入本地 Agent Bridge，获得 AI 问答和最近阅读列表。

界面采用墨笺（Mojian）设计系统的「墨」暗色主题：暖棕墨色 + 单一琥珀强调色 + 楷体阅读衬线。

## 两种形态

| 形态 | 构建/启动 | 能力 |
| --- | --- | --- |
| 静态版 | `npm run build` | 编辑、预览、批注、本地缓存、导入导出。纯静态文件，可部署到任意静态托管 |
| 完整版（本地） | `npm run dev` / `npm run build:bridge` | 静态版全部能力 + 最近阅读列表 + AI 问答（依赖本机 Agent Bridge 与 `claude` CLI） |

功能开关由构建模式控制（`--mode bridge` 或环境变量 `VITE_ENABLE_AGENT_BRIDGE=true`），同一套代码。

## 快速开始

```bash
npm install
npm run dev
```

终端会输出本地访问地址（通常是 `http://localhost:5173/`）。`npm run dev` 会同时启动前端和本地 Agent Bridge；也可以分开：

```bash
npm run dev:web     # 只启动前端
npm run dev:bridge  # 只启动本地 Agent Bridge
```

## 阅读字体（可选）

界面的楷体阅读字体是仓耳今楷 04。**字体不随仓库分发**（版权归字体所有者），不获取字体时会自动回退到系统楷体（Kaiti SC / 楷体），功能不受影响。

想要完整视觉效果，运行：

```bash
npm run font:fetch
```

脚本会从微信读书官方 CDN 下载字体、做 SHA-256 校验，并自动裁剪出 GB2312 字符集的 woff2 子集（约 2MB，原字体 16MB）放入 `public/fonts/`。生僻字由系统楷体逐字兜底。字体来源与校验信息见 `fonts-src/canger-jinkai-04/SOURCE.md`；使用请遵守字体所有者的许可条款。

## AI 助手依赖

AI 问答依赖本机安装有 [Claude Code](https://claude.com/claude-code) 的 `claude` 命令：

```bash
claude --version
```

也可以通过 `AGENT_BRIDGE_CLAUDE_COMMAND` 环境变量指定其他兼容命令。没有可用命令时，AI 助手不可用，其余功能不受影响。

## 核心能力

### 直接编辑，实时生效

编辑 Markdown 后右侧预览实时更新；预览区域也支持直接编辑并同步回原文，接近所见即所得。

### 双向定位

在 Markdown 原文双击定位到预览对应位置；在预览双击定位回原文。

### 划线批注

在预览中选中文字，可添加马克笔、波浪线、直线或想法批注，集中展示在「我的批注」面板。静态版的批注随当前文章保存在浏览器 `localStorage`。

### AI 问答（完整版）

选中文字后「问 AI」，AI 结合选中原文和整篇文档回答。问答记录保存为当前文档的子节点，可在最近阅读列表中重新打开。

### 最近阅读列表（完整版）

由本地 Agent Bridge 维护，记录同步到 Reading Workspace 的文档与问答。默认数据目录 `.reading-workspace/`，可用环境变量更换：

```bash
AGENT_BRIDGE_WORKSPACE=/path/to/reading npm run dev
```

## 浏览器插件：墨笺剪藏

仓库还附带一个浏览器插件（Chrome / Edge，MV3），把任意网页的正文、整页或选中内容转换成 Markdown，可预览、复制或下载 `.md`；也可以进入「墨笺阅读」页——左栏 Markdown 源、右栏实时预览，支持暗色/亮色主题与字号调整，给网页文章一个纯净的阅读体验。

```bash
npm run build:ext   # 构建到 dist-extension/，然后在 chrome://extensions 加载已解压的扩展程序
```

详见 [`extension/README.md`](./extension/README.md)。

## 开发

```bash
npm run check   # 代码体积约束 + 类型检查 + 测试 + 构建（含插件）
npm test        # 只跑测试
```

代码规范见 `docs/CODING_GUIDELINES.md`；使用编码 Agent 协作时请先读 `AGENTS.md`。

## License

代码以 [MIT](./LICENSE) 协议开源。仓耳今楷字体不属于本仓库授权范围，其使用与再分发受字体所有者的许可条款约束。
