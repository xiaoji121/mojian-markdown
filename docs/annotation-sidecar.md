# 批注 sidecar 起步规格

> 状态：起步文档（N-B）  
> 约束：**批注永不写回源文 `.md`**；侧车 / 导出文件与源文并存。

## 同目录约定

对源文件 `article.md`：

| 文件 | 用途 |
| --- | --- |
| `article.md` | **纯源文**，不含划线、想法或 AI 问答 |
| `article.annotations.md` | 人可读批注导出（标题 + 引用块 + 想法/问答 + 时间） |
| `article.annotations.json` | 机器可读 sidecar（字段见下） |
| `article-backup.zip` | 静态 Web 一键备份包：上述三者打成 zip |

扩展名规则：去掉源文件末尾的 `.md` / `.markdown` / `.txt` 后拼接后缀。无扩展名时按 `document.md` 处理。

## Sidecar JSON（`*.annotations.json`）

```json
{
  "version": 1,
  "sourceFile": "article.md",
  "exportedAt": "2026-10-10T05:21:00.000Z",
  "annotations": [
    {
      "id": "…",
      "quote": "原文摘录",
      "occ": 0,
      "start": 12,
      "type": "idea",
      "note": "我的想法",
      "ts": 1760073660000,
      "question": "可选 · AI",
      "answer": "可选 · AI",
      "reply": "可选 · 手贴回答",
      "requestId": "可选",
      "documentId": "可选"
    }
  ]
}
```

### 字段说明

| 字段 | 说明 |
| --- | --- |
| `version` | 格式版本；当前为 `1` |
| `sourceFile` | 配对的源 Markdown 文件名（同目录） |
| `exportedAt` | 导出时刻（ISO-8601） |
| `annotations[]` | 批注列表；顺序与侧栏一致 |
| `id` | 稳定标识 |
| `quote` | 锚定用的原文摘录 |
| `occ` | 同文摘录出现次序（0 起） |
| `start` | 可选字符偏移（与编辑器锚点一致） |
| `type` | `marker` \| `wavy` \| `straight` \| `idea` \| `ai` |
| `note` | 想法或补充；AI 类型可能为空 |
| `ts` | 创建时间戳（毫秒） |
| `question` / `answer` | AI 问答（可选） |
| `reply` | 用户粘贴的「找到的回答」（可选） |

实现见 `src/editor/annotationExport.ts`。导入 sidecar、跨设备合并与锚点指纹加固属后续工作，不在本起步规格范围。

## 批注 Markdown 导出模板

```markdown
# 《article.md》批注（共 N 条）

## 1 · 想法 · 2026/10/10 13:21

> 原文摘录

我的想法正文

## 2 · AI 问答 · 2026/10/10 13:22

> 原文摘录

**问题：** …

**回答：**

…
```

## 产品区分

- **纯源文**：只下载 / 保存 `.md` 正文。  
- **含批注资产**：`*.annotations.md`、`*.annotations.json`，或「全文+批注备份包」zip。  
- 剪贴板「复制全文+批注」仅便于粘贴；**落盘文件不得把批注写进源文**。
