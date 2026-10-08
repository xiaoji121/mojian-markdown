# README 截图

这组六张 JPEG 是 Chromium 对实际应用的截图，不是设计稿，也没有重绘、拼接或修改界面像素。

- 应用基线：`7ed561feaacaa4ac8c892f326a9b46c2949001fa`（合并 #25 后的 main）。截图脚本和文档更新不改变生产界面。
- 视口：1440 × 960，设备像素比 1，中文语言与上海时区。
- 内容：原创阅读文章与演示批注；未使用个人文件、账号或 API Key。
- AI：使用 Playwright 拦截的 Bridge fixture，回答正文明确显示「演示回答（非实时 AI 输出）」。渠道就绪状态也是演示 fixture，不证明真实 CLI 或账号可用。
- 字体：优先使用项目的可选阅读字体，失败时回退到已安装的中文系统字体；不把第三方字体提交到仓库。
- 图片使用 JPEG quality 92 直接输出，无后期 UI 修改。来源提交、浏览器版本和文件清单记录在 `../images/capture-manifest.json`。

## 重新生成

```bash
npm ci
npx playwright install --with-deps chromium
# Linux 上确保已安装中文字体，如 fonts-noto-cjk。
npm run font:fetch  # 可选；字体条款与校验见主 README
node docs/screenshots/capture.mjs
```

脚本自动启动 bridge 模式的 Vite 前端，使用隔离的浏览器上下文，阻止所有外部请求，并且只在浏览器内模拟 Bridge 响应。它不会运行真实 AI CLI，不会访问真实阅读工作区，不会部署或发布应用。

也可以运行 GitHub Actions 的 **README screenshots** 工作流，下载 `readme-screenshots` artifact，逐张检查后再更新 `docs/images/`。工作流只有仓库读取权限，不会自动提交图片。

| 文件 | 展示内容 |
| --- | --- |
| `editor-split-view.jpg` | 当前顶栏、Markdown 原文与实时预览 |
| `selection-toolbar.jpg` | 预览划词后的真实工具条 |
| `annotation-panel.jpg` | 阅读视图与想法批注 |
| `immersive-parchment.jpg` | 羊皮纸沉浸阅读 |
| `immersive-green.jpg` | 豆沙绿沉浸阅读 |
| `ai-reading-assistant.jpg` | AI 侧栏、当前引用、渠道状态与演示回答 |

更新时检查中文是否完整、工具条是否被裁切、图片对应的功能入口与 README 文案是否一致。不要用旧截图、真实个人内容或不标记来源的虚构 AI 回答替代。
