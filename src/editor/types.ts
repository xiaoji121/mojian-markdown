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

export interface PersistedEditorState {
  content: string;
  fileName: string;
  fontSize: number;
  theme: EditorTheme;
  comments: Annotation[];
  bridgeDocumentId?: string;
}

export interface EditorProps {
  theme?: EditorTheme;
  previewEditable?: boolean;
  wrapSource?: boolean;
}
