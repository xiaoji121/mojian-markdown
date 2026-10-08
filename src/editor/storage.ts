import type { PersistedEditorState } from './types';

export const EDITOR_STORAGE_KEY = 'md-editor-warm-v1';
let storageError = '';
export function getEditorStorageError(): string { return storageError; }

export function loadEditorState(): Partial<PersistedEditorState> | null {
  storageError = '';
  try {
    if (typeof window !== 'undefined' && window.mojianDesktop?.loadEditorState) {
      const result = window.mojianDesktop.loadEditorState();
      if (!result.ok) throw new Error(result.error || '桌面草稿读取失败');
      return result.state || null;
    }
    const value = localStorage.getItem(EDITOR_STORAGE_KEY);
    if (!value) return null;
    const state = JSON.parse(value);
    return state && typeof state === 'object' && !Array.isArray(state) ? state : null;
  } catch (error) {
    storageError = error instanceof Error ? error.message : '草稿读取失败';
    return null;
  }
}

export function saveEditorState(state: PersistedEditorState): boolean {
  try {
    if (typeof window !== 'undefined' && window.mojianDesktop?.saveEditorState) {
      const result = window.mojianDesktop.saveEditorState(state);
      if (!result.ok) throw new Error(result.error || '桌面草稿保存失败');
    } else {
      localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(state));
    }
    storageError = '';
    return true;
  } catch (error) {
    storageError = error instanceof Error ? error.message : '草稿保存失败';
    return false;
  }
}
