# 墨笺剪藏（浏览器插件）

把当前网页转换成 Markdown 的浏览器插件（Chrome / Edge，Manifest V3）。点击工具栏图标即可预览、复制、下载 `.md`，或进入「墨笺阅读」页获得纯净的双栏阅读体验。

## 功能

### 墨笺阅读（阅读模式）

弹窗中点「阅读」进入独立阅读页：左栏是网页转出的 Markdown 源（可直接编辑，实时生效），右栏是渲染后的文章预览，排版沿用墨笺编辑器的楷体阅读风格。顶栏支持：

- **暗色 / 亮色主题**：墨色暗主题与宣纸亮主题一键切换；
- **字号调整**：A− / A+（14–26px）；
- **源码栏开关**：隐藏左栏，只看渲染后的文章；
- **沉浸阅读**：源码栏和工具栏全部隐藏，整屏只留正文；鼠标移到顶部临时唤出工具栏，按 `Esc` 或点「退出沉浸」返回；
- 复制与下载 `.md`。

主题、字号、源码栏与沉浸偏好会记住。出于安全考虑，剪藏内容里的原始 HTML 在预览中一律转义（仅保留表格内换行的 `<br>`），外链一律新标签页打开。

### 剪藏

- **三种转换范围**：
  - **正文**：用 [Readability](https://github.com/mozilla/readability)（Firefox 阅读模式同款）提取文章正文，去掉导航、侧栏、页脚等噪音；
  - **整页**：转换整个页面 `<body>`；
  - **选中内容**：页面上有选区时自动启用并优先选中，只转换选中的部分。
- **元信息头**：可选的 YAML front matter（标题、来源地址、剪藏时间、作者、摘要）加一级标题。
- **保真转换**：表格（复用编辑器同款转换规则）、围栏代码块（保留语言标记，内容含 ``` 时自动升级围栏）、删除线、嵌套列表；相对链接与图片地址转为绝对地址；懒加载图片按实际渲染地址（`currentSrc` / `data-src`）还原。
- **预览可编辑**：弹窗里的预览是文本框，复制前可以直接修改。
- 快捷键 `Alt+Shift+M` 打开（可在 `chrome://extensions/shortcuts` 修改）。

## 构建与安装

```bash
npm install
npm run build:ext   # 产物输出到 dist-extension/
```

然后在 Chrome / Edge 中加载：

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）；
2. 打开右上角「开发者模式」；
3. 点击「加载已解压的扩展程序」，选择仓库下的 `dist-extension/` 目录。

## 权限说明

只申请了最小权限，**不需要**任何站点的常驻访问权：

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 点击图标时临时获得当前标签页的访问权 |
| `scripting` | 向当前页面注入一个只读的快照抓取函数 |
| `clipboardWrite` | 「复制」按钮写入剪贴板 |

所有转换都在本地弹窗里完成，不发出任何网络请求，也不收集数据。

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `src/pageCapture.ts` | 注入页面的自包含快照函数（HTML、选区、懒加载图片修正） |
| `src/extract.ts` | 快照解析：DOMParser 重建、地址绝对化、Readability 正文提取 |
| `src/convert.ts` | Turndown 配置与 Markdown 组装（纯逻辑，被 `tests/extensionConvert.test.ts` 覆盖） |
| `src/popup.ts` / `popup.html` / `src/popup.css` | 弹窗 UI |
| `src/reader.ts` / `reader.html` / `src/reader.css` | 墨笺阅读页（双栏、主题、字号） |
| `src/render.ts` | 阅读页 Markdown 渲染（marked + 原始 HTML 转义，被 `tests/extensionRender.test.ts` 覆盖） |
| `src/readerDoc.ts` | 弹窗与阅读页之间的文档交接（扩展源 localStorage） |
| `public/manifest.json` | MV3 清单 |
| `../scripts/make-extension-icons.mjs` | 图标生成（构建时自动执行） |

表格转换规则复用主编辑器的 `src/editor/markdownTableRules.ts`，保证剪藏结果与编辑器行为一致。

## 已知限制

- 浏览器内置页面（`chrome://`、扩展商店等）无法访问，弹窗会给出提示；
- 跨多个表格单元格的选区会丢失表格结构（按纯文本转换）；
- 正文模式依赖 Readability 的启发式判断，识别失败时自动回退为整页转换并在状态栏提示。
