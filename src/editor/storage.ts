import type { PersistedEditorState } from './types';

export const EDITOR_STORAGE_KEY = 'md-editor-warm-v1';

export function loadEditorState(): Partial<PersistedEditorState> | null {
  try {
    const value = localStorage.getItem(EDITOR_STORAGE_KEY);
    if (!value) return null;

    const state = JSON.parse(value);
    return state && typeof state === 'object' ? state : null;
  } catch {
    return null;
  }
}

export function saveEditorState(state: PersistedEditorState): void {
  try {
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Local storage can be unavailable in private or restricted contexts.
  }
}
