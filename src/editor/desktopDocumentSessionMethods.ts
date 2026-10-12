// @ts-nocheck
import { t } from './i18n.ts';

export class DesktopDocumentSessionMethods {
  _pcFlushPendingDraft() {
    if (!this._pcDesktop() || !this._saveT) return;
    clearTimeout(this._saveT); this._saveT = null;
    this._autosave();
  }

  _pcDocumentSnapshot() {
    if (!this._pcDesktop()) return null;
    return JSON.stringify([this.sourceRef.current?.value,this.fileName,this.comments]);
  }

  _pcDocumentChanged(snapshot) {
    if (!snapshot || !this._pcDesktop() || snapshot === this._pcDocumentSnapshot()) return false;
    this._setStatus(t('切换期间内容已变化，已保留当前文稿；请重新打开目标文稿。'));
    return true;
  }

  _pcDraftFeedback(saved) {
    if (!this._pcDesktop()) return;
    this._pcDraftFailed = saved === false;
    this._pcSyncSaveStatus?.();
  }

  _pcBridgeFeedback(state, payload, snapshot) {
    if (!this._pcDesktop()) return;
    if (payload && (payload.fileName !== this.fileName || payload.localPath !== (this.localFilePath || undefined))) return;
    this._pcBridgeState = state === 'saved' && snapshot && snapshot !== this._pcDocumentSnapshot() ? 'pending' : state;
    this._pcSyncSaveStatus?.();
    if (state === 'failed') this._setStatus(t('本地工作区同步未完成'));
  }

  _pcCanLeaveDocument() {
    if (!this._pcDesktop() || this._pcBridgeState !== 'failed') return true;
    this._pcShowSyncFailure();
    return false;
  }

  _pcCacheDocumentSession() {
    if (!this._pcDesktop() || !this.bridgeDocumentId) return;
    this._syncCurrentEditingState();
    const cache = this._pcDocumentSessions || (this._pcDocumentSessions = new Map());
    cache.delete(this.bridgeDocumentId);
    cache.set(this.bridgeDocumentId,{value:this.sourceRef.current.value,
      history:this._editingHistory.map(item=>({...item})), index:this._editingHistoryIndex,
      caret:this._captureEditingState(), previewScroll:this.previewRef.current.scrollTop});
    if (cache.size > 10) cache.delete(cache.keys().next().value);
  }

  _pcRestoreDocumentSession() {
    if (!this._pcDesktop()) return;
    this._pcCommentEditor = null; this._pcParagraph = null; this._pcCommentFilter = 'all';
    this._pcBridgeState = null; this._pcSyncCommentView?.();
    const saved = this._pcDocumentSessions?.get(this.bridgeDocumentId);
    const source = this.sourceRef.current;
    if (!saved || saved.value !== source.value) return;
    this._editingHistory = saved.history.map(item=>({...item})); this._editingHistoryIndex = saved.index;
    this._lastHistoryInputType = ''; this._lastHistoryInputAt = 0;
    source.setSelectionRange(saved.caret.selectionStart,saved.caret.selectionEnd);
    source.scrollTop = saved.caret.scrollTop; source.scrollLeft = saved.caret.scrollLeft;
    this.previewRef.current.scrollTop = saved.previewScroll;
    this._syncEditingHistoryButtons();
  }

  _pcShowSyncFailure() {
    this._pcShowDialog({title:'本地工作区同步未完成',message:'当前页面内容保留，尚未确认写入本地工作区。',
      confirm:'重试同步', action:async()=>{ await this._syncDocumentToBridge(); return this._pcBridgeState !== 'failed'; }});
  }
}
