// @ts-nocheck
import { t, getLocale } from './i18n.ts';

const blockSelector = 'p,li,h1,h2,h3,h4,h5,h6,pre,td,th';
function paragraphText(block) {
  const clone = block.cloneNode(true);
  clone.querySelectorAll('[data-comment-badge]').forEach(node => node.remove());
  return clone.textContent;
}

export class DesktopCommentMethods {
  _pcFocusCommentInput(node, delay) {
    const previous = document.activeElement;
    setTimeout(()=>{
      if (!node.isConnected) return;
      if (this._pcDesktop() && (this._pcDialog || document.activeElement !== previous)) return;
      node.focus();
    },delay);
  }

  _pcCaptureCommentFocus() {
    const node = document.activeElement;
    if (!this._pcDesktop() || !node?.matches('textarea') || !this.commentListRef.current?.contains(node)) return null;
    return {id:node.closest('[data-card-id]').dataset.cardId,reply:node.classList.contains('comment-reply-input'),
      start:node.selectionStart,end:node.selectionEnd,scroll:node.scrollTop,listScroll:this.commentListRef.current.scrollTop};
  }

  _pcRestoreCommentFocus(saved) {
    if (!saved || !this._pcDesktop()) return;
    const card = [...this.commentListRef.current.querySelectorAll('[data-card-id]')].find(card=>card.dataset.cardId === saved.id);
    const node = card?.querySelector(saved.reply ? '.comment-reply-input' : '.comment-note-input:not(.comment-reply-input)');
    if (!node) return;
    node.focus({preventScroll:true}); node.setSelectionRange(saved.start,saved.end); node.scrollTop = saved.scroll;
    this.commentListRef.current.scrollTop = saved.listScroll;
  }

  _pcRevealComment(id) {
    if (!this._pcDesktop()) return;
    if (this._pcCommentEditor && this._pcCommentEditor.id !== id) this._pcCloseCommentEditor();
    this._pcCommentFilter = 'all'; this._pcSyncCommentView();
  }

  _initDesktopComments() {
    const panel = this.commentsRef.current;
    if (!panel || this._pcCommentFilters) return;
    const filters = document.createElement('div'); filters.className = 'pc-comment-filters pc-editing-only';
    filters.role = 'group'; filters.setAttribute('aria-label',t('批注'));
    ['all','paragraph'].forEach((key,index) => {
      const button = document.createElement('button'); button.dataset.pcFilter = key;
      button.dataset.i18n = index ? '当前段落' : '所有批注'; button.textContent = t(button.dataset.i18n);
      button.addEventListener('click', () => { this._pcCommentFilter = key; this._pcCloseCommentEditor(); this._pcSyncCommentView(); });
      filters.append(button);
    });
    const editorHead = document.createElement('div'); editorHead.className = 'pc-comment-editor-head pc-editing-only'; editorHead.hidden = true;
    const title = document.createElement('strong');
    const back = document.createElement('button'); back.className = 'pc-comment-back';
    back.dataset.i18n = '返回批注列表'; back.textContent = t('返回批注列表');
    back.addEventListener('click', () => this._pcCloseCommentEditor(true)); editorHead.append(title, back);
    panel.insertBefore(filters,this.commentListRef.current); panel.insertBefore(editorHead,this.commentListRef.current);
    this._pcCommentFilters = filters; this._pcCommentEditorHead = editorHead;
    const status = document.createElement('div'); status.className = 'pc-comment-status pc-editing-only'; status.role = 'status';
    panel.append(status); this._pcCommentStatus = status;
    this.previewRef.current.addEventListener('click',event=>this._pcRememberParagraph(event.target));
    this.previewRef.current.addEventListener('keyup',()=>this._pcRememberParagraph(window.getSelection()?.anchorNode));
    this.previewRef.current.addEventListener('mouseup',()=>this._pcRememberParagraph(window.getSelection()?.anchorNode));
    this._pcSyncCommentView(); this._pcSyncSaveStatus();
  }

  _pcRememberParagraph(node) {
    if (!this._pcDesktop() || !node) return;
    const element = node.nodeType === 3 ? node.parentElement : node;
    const block = element.closest?.(blockSelector), root = this.previewRef.current;
    if (!block || !root.contains(block)) return;
    const text = paragraphText(block);
    const same = [...root.querySelectorAll(blockSelector)].filter(item=>paragraphText(item) === text);
    this._pcParagraph = {text,occ:same.indexOf(block),source:this.sourceRef.current.value};
    this._pcSyncCommentView();
  }

  _pcParagraphBlock() {
    if (!this._pcParagraph || this._pcParagraph.source !== this.sourceRef.current.value) return null;
    const {text,occ} = this._pcParagraph;
    return [...this.previewRef.current.querySelectorAll(blockSelector)].filter(item=>paragraphText(item) === text)[occ] || null;
  }

  _pcEnhanceComment(card, comment) {
    card.firstElementChild.classList.add('pc-comment-card-head');
    const quote = card.querySelector('.comment-quote');
    quote.tabIndex = 0; quote.role = 'button'; quote.setAttribute('aria-label',t('定位原文') + ': ' + comment.quote);
    quote.addEventListener('keydown',event=>{
      if (['Enter',' '].includes(event.key)) { event.preventDefault(); this._focusComment(comment.id); }
    });
    const footer = document.createElement('div'); footer.className = 'pc-comment-footer pc-editing-only';
    const time = document.createElement('time');
    const date = new Date(comment.ts || comment.createdAt || 0);
    if (date.getTime() > 0) { time.dateTime = date.toISOString(); time.textContent = date.toLocaleString(getLocale(),{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
    footer.append(time);
    const note = card.querySelector('.comment-note-input:not(.comment-reply-input)');
    if (note) {
      note.setAttribute('aria-label',t('我的想法'));
      const edit = document.createElement('button'); edit.className = 'pc-comment-edit'; edit.textContent = t('编辑想法');
      edit.addEventListener('click',()=>{ this._pcEnterCommentEditor(comment.id,'note'); note.focus({preventScroll:true}); });
      footer.append(edit);
      note.addEventListener('focus',()=>{ if (this._pcDesktop()) this._pcEnterCommentEditor(comment.id,'note'); });
    }
    const reply = card.querySelector('.comment-reply-input');
    if (reply) { reply.setAttribute('aria-label',t('粘贴回复')); reply.addEventListener('focus',()=>{ if (this._pcDesktop()) this._pcEnterCommentEditor(comment.id,'reply'); }); }
    const hint = document.createElement('p'); hint.className = 'pc-comment-autosave pc-editing-only';
    hint.textContent = (reply ? t('记录从别处找到的回答；这里不是多人评论。') + ' ' : '') + t('输入即时保存为当前设备草稿，关闭编辑不会撤销内容。');
    card.append(footer,hint);
  }

  _pcEnterCommentEditor(id, kind) {
    this._pcCommentEditor = {id,kind}; this._pcSyncCommentView();
  }

  _pcCloseCommentEditor(focus = false) {
    const active = this._pcCommentEditor;
    this._pcCommentEditor = null;
    if (active?.kind === 'reply') { this._openReplyIds?.delete(active.id); this._renderComments(); }
    this._pcSyncCommentView();
    if (focus && active) [...this.commentListRef.current.querySelectorAll('[data-card-id]')]
      .find(card=>card.dataset.cardId === active.id)?.querySelector('.pc-comment-edit,button')?.focus({preventScroll:true});
  }

  _pcSyncCommentView() {
    const list = this.commentListRef?.current;
    if (!list || !this._pcCommentFilters) return;
    const desktop = this._pcDesktop();
    const editor = desktop && this._pcCommentEditor;
    if (editor && !this.comments.some(comment=>comment.id === editor.id)) this._pcCommentEditor = null;
    const editing = desktop && this._pcCommentEditor;
    const filtered = this._pcCommentFilter === 'paragraph';
    const block = filtered ? this._pcParagraphBlock() : null;
    const ids = new Set([...block?.querySelectorAll('[data-comment-id]') || []].map(mark=>mark.dataset.commentId));
    let visible = 0;
    list.querySelectorAll('[data-card-id]').forEach(card=>{
      card.hidden = desktop && (editing ? card.dataset.cardId !== editing.id : filtered && !ids.has(card.dataset.cardId));
      card.dataset.pcEditor = editing?.id === card.dataset.cardId ? editing.kind : '';
      if (!card.hidden) visible++;
    });
    this._pcCommentFilters.hidden = !!editing;
    this._pcCommentFilters.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String((this._pcCommentFilter || 'all') === button.dataset.pcFilter)));
    this._pcCommentEditorHead.hidden = !editing;
    if (editing) this._pcCommentEditorHead.querySelector('strong').textContent = t(editing.kind === 'reply' ? '粘贴回复' : '我的想法');
    list.querySelector('.pc-comment-filter-empty')?.remove();
    if (desktop && filtered && !visible && !editing) {
      const empty = document.createElement('p'); empty.className = 'pc-comment-filter-empty pc-editing-only'; empty.role = 'status';
      empty.textContent = t(!this._pcParagraph ? '请先在正文中点击或选中一个段落。' : !block ? '段落已变化，请重新选择。' : '当前段落没有批注。');
      list.append(empty);
    }
    this._pcSyncSaveStatus();
  }

  _pcSyncSaveStatus() {
    if (!this._pcCommentStatus) return;
    const status = this._pcCommentStatus; status.replaceChildren();
    const key = this._pcDraftFailed ? '当前草稿保存失败，请保存到文件。'
      : this._pcBridgeState === 'failed' ? '本地工作区同步未完成'
      : this._pcBridgeState === 'pending' ? '本地工作区正在同步…'
      : this._pcBridgeState === 'saved' ? '本地工作区已同步' : '输入即时保存为当前设备草稿，关闭编辑不会撤销内容。';
    status.textContent = t(key); status.dataset.state = this._pcDraftFailed || this._pcBridgeState === 'failed' ? 'failed' : 'info';
    if (this._pcBridgeState === 'failed') {
      const retry = document.createElement('button'); retry.textContent = t('重试同步');
      retry.addEventListener('click',()=>this._syncDocumentToBridge()); status.append(retry);
    }
  }
}
