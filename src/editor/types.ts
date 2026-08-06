export type EditorTheme = 'dark' | 'light';

export type AnnotationType = 'marker' | 'wavy' | 'straight' | 'idea' | 'ai';

export interface Annotation {
  id: string;
  quote: string;
  occ: number;
  start?: number;
  type: AnnotationType;
  note: string;
  ts: number;
  question?: string;
  answer?: string;
  requestId?: string;
  documentId?: string;
  aiStatus?: 'pending' | 'answered' | 'error';
}

export type PaperTheme = 'ink' | 'parchment' | 'cream' | 'snow' | 'green';

export interface PersistedEditorState {
  content: string;
  fileName: string;
  fontSize: number;
  theme: EditorTheme;
  /** 暗色主题下的纸色；缺省为墨黑 */
  paperDark?: PaperTheme;
  /** 亮色主题下的纸色；缺省为羊皮纸 */
  paperLight?: PaperTheme;
  /** @deprecated 旧的单份纸色记忆，读取时迁移到 paperDark/paperLight */
  paper?: PaperTheme;
  /** 沉浸式阅读是否使用宽屏内容宽度 */
  immersiveWide?: boolean;
  /** 保存长图使用的宽度档位（见 longImageComposer 的 LONG_IMAGE_PRESETS） */
  longImageWidth?: string;
  /** 长图是否带上划线批注；缺省为带 */
  longImageMarks?: boolean;
  comments: Annotation[];
  bridgeDocumentId?: string;
  /** AI 问答使用的本地 CLI 引擎；缺省为 claude */
  aiEngine?: 'claude' | 'codex' | 'gemini';
  /** 草稿最后一次持久化的时间戳，用于恢复本地文件关联时判断谁更新 */
  savedAt?: number;
}

export interface EditorProps {
  theme?: EditorTheme;
  wrapSource?: boolean;
}
