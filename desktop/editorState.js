// Durable draft storage belongs to the application, not the bridge's random origin.
import * as fs from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const stringFields = ['content', 'fileName', 'bridgeDocumentId', 'longImageWidth', 'localFilePath'];
const numberFields = ['fontSize', 'longImagePhoneFontSize', 'longImageStandardFontSize', 'savedAt', 'localFileModifiedAt',
  'aiPanelWidth', 'commentsPanelWidth', 'documentSidebarWidth'];
const booleanFields = ['immersiveWide', 'longImageMarks', 'dirty'];
const choices = {
  theme: ['dark', 'light'], aiEngine: ['claude', 'codex', 'gemini'],
  paper: ['ink', 'parchment', 'cream', 'snow', 'green'],
  paperDark: ['ink', 'parchment', 'cream', 'snow', 'green'],
  paperLight: ['ink', 'parchment', 'cream', 'snow', 'green']
};
function copyFields(source, target, fields, type) {
  for (const key of fields) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== type || (type === 'number' && !Number.isFinite(source[key]))) {
      throw new Error(`Invalid editor state: ${key}`);
    }
    target[key] = source[key];
  }
}
function sanitizeAnnotation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid annotation');
  const result = {};
  copyFields(value, result, ['id', 'quote', 'note', 'question', 'answer', 'requestId', 'documentId', 'reply', 'answerRequestId'], 'string');
  copyFields(value, result, ['occ', 'start', 'ts', 'replyAt'], 'number');
  copyFields(value, result, ['hiddenFromReadingTree'], 'boolean');
  if (!['marker', 'wavy', 'straight', 'idea', 'ai'].includes(value.type)) throw new Error('Invalid annotation type');
  result.type = value.type;
  if (value.aiStatus !== undefined) {
    if (!['pending', 'answered', 'error'].includes(value.aiStatus)) throw new Error('Invalid annotation status');
    result.aiStatus = value.aiStatus;
  }
  return result;
}
export function sanitizeEditorState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.content !== 'string') {
    throw new Error('Invalid editor state');
  }
  const result = {};
  copyFields(value, result, stringFields, 'string');
  copyFields(value, result, numberFields, 'number');
  copyFields(value, result, booleanFields, 'boolean');
  for (const [key, allowed] of Object.entries(choices)) {
    if (value[key] === undefined) continue;
    if (!allowed.includes(value[key])) throw new Error(`Invalid editor state: ${key}`);
    result[key] = value[key];
  }
  if (value.pinnedDocumentIds !== undefined) {
    if (!Array.isArray(value.pinnedDocumentIds) || value.pinnedDocumentIds.some((id) => typeof id !== 'string')) {
      throw new Error('Invalid pinned document IDs');
    }
    result.pinnedDocumentIds = [...value.pinnedDocumentIds];
  }
  if (value.comments !== undefined) {
    if (!Array.isArray(value.comments)) throw new Error('Invalid annotations');
    result.comments = value.comments.map(sanitizeAnnotation);
  }
  return result;
}

export function createEditorStateStore(userData, io = fs) {
  const path = join(userData, 'editor-state.json');
  let blocked = null;
  function load() {
    try {
      const record = JSON.parse(io.readFileSync(path, 'utf8'));
      if (record.version !== 1) throw new Error('Unsupported editor state version');
      const state = sanitizeEditorState(record.state);
      return { ok: true, state };
    } catch (error) {
      if (error.code === 'ENOENT') return { ok: true, state: null };
      blocked = `无法读取桌面草稿，原文件已保留：${error.message}`;
      return { ok: false, error: blocked };
    }
  }
  function save(value) {
    let temp = null;
    let fd;
    try {
      // Check the existing record even if this renderer did not load it first.
      if (blocked || !load().ok) throw new Error(blocked);
      const state = sanitizeEditorState(value);
      io.mkdirSync(userData, { recursive: true, mode: 0o700 });
      temp = `${path}.${randomUUID()}.tmp`;
      fd = io.openSync(temp, 'wx', 0o600);
      io.writeFileSync(fd, JSON.stringify({ version: 1, state }), 'utf8');
      io.fsyncSync(fd);
      io.closeSync(fd); fd = undefined;
      io.renameSync(temp, path); temp = null;
      // Flush the directory entry on platforms that support directory fsync.
      if (process.platform !== 'win32') {
        fd = io.openSync(userData, 'r'); io.fsyncSync(fd); io.closeSync(fd); fd = undefined;
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    } finally {
      if (fd !== undefined) { try { io.closeSync(fd); } catch {} }
      if (temp) { try { io.unlinkSync(temp); } catch {} }
    }
  }
  return { load, save };
}

export function isTrustedEditorSender(event, window, bridgeUrl) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return false;
  try {
    const url = new URL(event.senderFrame.url);
    const expected = new URL(bridgeUrl);
    return url.origin === expected.origin && url.pathname === '/';
  } catch { return false; }
}
