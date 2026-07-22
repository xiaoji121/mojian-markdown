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
  comments: Annotation[];
  bridgeDocumentId?: string;
}

export interface EditorProps {
  theme?: EditorTheme;
  wrapSource?: boolean;
}
