// @ts-nocheck
import { t } from './i18n.ts';
import { createAnnotationDraft, annotationDraftDirty, commitAnnotationDraft } from './mobileAnnotationDraft.ts';
const DRAFT_KEY = 'mojian-mobile-annotation-draft-v1';
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
export class MobileAnnotationMethods {
  _isMobileAnnotation() { return window.matchMedia('(max-width: 760px)').matches; }
  _annotationDocumentKey() {
    const source = this.sourceRef.current?.value || '';
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
    return [this.bridgeDocumentId || this.fileName, this.activeAnswerRequestId || '', source.length, hash >>> 0].join(':');
  }
  _initMobileAnnotations() {
    this._maRoot = document.createElement('div');
    this._maRoot.className = 'mobile-annotation-overlay'; this._maRoot.hidden = true;
    document.body.appendChild(this._maRoot);
    this._maKey = e => {
      if (this._maRoot.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this._maRequestClose(); }
      if (e.key === 'Tab') {
        const dialog = this._maRoot.querySelector('.mobile-annotation-confirm') || this._maRoot.querySelector('[role="dialog"]');
        const nodes = [...dialog.querySelectorAll('button,textarea,summary')].filter(n => !n.disabled && n.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', this._maKey, true);
    this._maUnload = e => { if (annotationDraftDirty(this._maDraft)) { this._maStashDraft(); e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', this._maUnload);
    this._maResize = () => {
      const viewport = window.visualViewport;
      this._maRoot.style.setProperty('--annotation-viewport-height', (viewport?.height || window.innerHeight) + 'px');
      this._maRoot.style.setProperty('--annotation-viewport-top', (viewport?.offsetTop || 0) + 'px');
      if (!this._isMobileAnnotation() && !this._maRoot.hidden) {
        if (annotationDraftDirty(this._maDraft)) this._maConfirm('discard');
        else { this._maClearDraft(); this._maClose(); }
      }
      if (this._maDraft) this._maStashDraft();
    };
    window.addEventListener('resize', this._maResize); window.visualViewport?.addEventListener('resize', this._maResize);
    window.visualViewport?.addEventListener('scroll', this._maResize); this._maResize();
    const bar = this.selBarRef.current;
    this._maPointer = e => { if (this._isMobileAnnotation()) e.preventDefault(); };
    bar?.addEventListener('pointerdown', this._maPointer);
  }
  _maButton(label, action, attr = '') {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = t(label);
    if (attr) button.setAttribute(attr, ''); button.addEventListener('click', action); return button;
  }
  _maText(tag, text, className = '') {
    const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
  }
  _maShow(title, full = false) {
    if (!this._maRoot.hidden && this._maRoot.dataset.mode === 'list') this._maListScroll = this._maRoot.querySelector('.mobile-annotation-sheet')?.scrollTop || 0;
    if (this._maRoot.hidden) {
      this._maListScroll = 0;
      this._maReturnFocus = document.activeElement; this._maScroll = this.previewRef.current.scrollTop;
      this._maSelectionRange = window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0).cloneRange() : null;
      this._maInert = [...document.body.children].filter(n => n !== this._maRoot).map(n => [n,n.inert]);
      this._maInert.forEach(([n]) => {n.inert = true;});
      this._maSourceSelection = [this.sourceRef.current.selectionStart, this.sourceRef.current.selectionEnd];
    }
    this._maRoot.hidden = false; this._maRoot.innerHTML = ''; this._maRoot.classList.toggle('is-detail', full);
    this._maRoot.classList.toggle('is-resized', !this._isMobileAnnotation()); this._maRoot.dataset.mode = this._maMode;
    const backdrop = this._maButton('关闭', () => this._maRequestClose()); backdrop.className = 'mobile-annotation-backdrop'; backdrop.tabIndex = -1;
    const sheet = document.createElement('section'); sheet.className = 'mobile-annotation-sheet';
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', t(title));
    const heading = document.createElement('header'); heading.appendChild(this._maText('h2', t(title)));
    const close = this._maButton('关闭', () => this._maRequestClose(), 'data-mobile-close');
    close.innerHTML = CLOSE; close.setAttribute('aria-label', t('关闭')); heading.appendChild(close);
    sheet.appendChild(heading);
    let dragStart = null;
    heading.addEventListener('pointerdown', e => {if (!e.target.closest('button')) {dragStart=e.clientY;heading.setPointerCapture(e.pointerId);}});
    heading.addEventListener('pointerup', e => {if (dragStart !== null && e.clientY-dragStart>72) this._maRequestClose(); dragStart=null;});
    this._maRoot.append(backdrop, sheet);
    this.selBarRef.current.style.display = 'none'; this._closeSelOverflowMenu?.();
    this._maResize(); close.focus({preventScroll:true}); return sheet;
  }
  _maClose(restore = true) {
    if (!this._maRoot) return;
    const mode = this._maMode;
    this._maRoot.hidden = true; this._maRoot.innerHTML = ''; this._maMode = ''; this._maDraft = null;
    this._maInert?.forEach(([n,inert]) => {n.inert = inert;});
    if (restore && mode === 'selection' && this._maSelectionRange) {const selection = window.getSelection();selection.removeAllRanges();selection.addRange(this._maSelectionRange);}
    this.panelOpen = false;
    if (restore) {
      this.previewRef.current.scrollTop = this._maScroll || 0;
      this.sourceRef.current.setSelectionRange(...(this._maSourceSelection || [0,0]));
    }
    const focus = this._maReturnFocus;
    if (focus?.isConnected && focus.getClientRects().length) focus.focus({preventScroll:true});
    else [...document.querySelectorAll('[data-mobile-action="comments"],.view-mode-option')].find(n => n.getClientRects().length)?.focus({preventScroll:true});
    this._syncFullscreenLayout();
  }
  _maRequestClose() {
    if (this._maRoot.querySelector('.mobile-annotation-confirm')) { this._maRemoveConfirm(); return; }
    if (annotationDraftDirty(this._maDraft)) { this._maConfirm('discard'); return; }
    if (this._maMode === 'copy' && this._maCopyParent === 'list') { this._maList(); return; }
    if (this._maMode === 'edit') { const isNew = this._maDraft.isNew; this._maClearDraft(); this._maDraft = null; if (isNew) this._maClose(); else this._maList(); }
    else this._maClose();
  }
  _maStashDraft() {
    if (!this._maDraft) return;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(this._maDraft)); }
    catch { this._setStatus(t('草稿暂时无法保留，请先保存批注')); }
  }
  _maClearDraft() { try { sessionStorage.removeItem(DRAFT_KEY); } catch {} }
  _maRecoveredDraft() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      if (draft?.documentKey === this._annotationDocumentKey() && draft.original?.quote && typeof draft.note === 'string' && typeof draft.reply === 'string') return draft;
    } catch {}
    return null;
  }
  _maList() {
    this._maMode = 'list'; this.panelOpen = true;
    const sheet = this._maShow('批注');
    sheet.appendChild(this._maText('p', (this.fileName || '') + ' · ' + this.comments.length, 'mobile-annotation-meta'));
    const recovery = this._maRecoveredDraft();
    if (recovery) sheet.appendChild(this._maButton('继续编辑未保存的草稿', () => { this._maDraft = recovery; this._maEdit(); }, 'data-mobile-resume'));
    const list = document.createElement('div'); list.className = 'mobile-annotation-list';
    if (!this.comments.length) {
      const empty = this._maText('div', t('留住第一个想法'), 'mobile-annotation-empty');
      empty.appendChild(this._maText('p', t('回到正文，长按选中一句话。可以做标记，也可以写下想法。')));
      empty.appendChild(this._maButton('回到正文', () => this._maClose())); list.appendChild(empty);
    }
    this.comments.forEach(c => list.appendChild(this._maCard(c)));
    sheet.append(list, this._maText('p', t('批注单独保存，不改动 Markdown 原文'), 'mobile-annotation-meta'));
    if (this.comments.length) sheet.appendChild(this._maButton('复制全部批注', () => this._maCopyScreen(this._allCommentsText())));
    requestAnimationFrame(() => { if (sheet.isConnected) sheet.scrollTop = this._maListScroll || 0; });
  }
  _maCard(c) {
    const card = document.createElement('article'); card.className = 'mobile-annotation-card'; card.dataset.cardId = c.id;
    const quote = this._maText('p', c.quote, 'mobile-annotation-quote'); quote.dataset.mark = c.type;
    card.append(quote, this._maText('p', c.note || (c.type === 'ai' ? c.answer || '' : t('可补充想法（可选）…'))));
    if (c.reply) card.appendChild(this._maText('p', c.reply, 'mobile-annotation-reply-preview'));
    card.appendChild(this._maText('time', new Date(c.ts || Date.now()).toLocaleString(), 'mobile-annotation-meta'));
    const actions = document.createElement('footer');
    actions.append(this._maButton('定位原文', () => this._maLocate(c)), this._maButton(c.type === 'ai' ? '查看批注' : '编辑', () => this._maStartEdit(c), 'data-mobile-edit'));
    const more = document.createElement('details'); more.className = 'mobile-annotation-card-more';
    const summary = document.createElement('summary'); summary.setAttribute('aria-label',t('更多')); summary.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';
    more.appendChild(summary);
    more.appendChild(this._maButton('复制', () => this._maCopyScreen(this._commentText(c), c)));
    more.appendChild(this._maButton('删除', () => {more.open=false; this._maDeleteId = c.id; this._maConfirm('delete');}, 'data-mobile-delete'));
    actions.appendChild(more);
    card.appendChild(actions); return card;
  }
  async _maLocate(c) {
    await this._openCommentView(c); this._maClose(false);
    const mark = this.previewRef.current.querySelector('[data-comment-id="' + c.id + '"]');
    if (mark) { this._scrollPreviewTo(mark); this._flashEl(mark); }
    else this._setStatus(t('原文位置暂不可用，批注内容仍保留'));
  }
  _maStartEdit(c, isNew = false) {
    const previous = this._maRecoveredDraft();
    const same = previous && previous.isNew === isNew && (c.id ? previous.original.id === c.id : previous.original.quote === c.quote && previous.original.start === c.start);
    if (previous && annotationDraftDirty(previous) && !same) {
      this._maDraft = previous; this._maEdit(); this._maError(t('请先保存或放弃之前的草稿')); return;
    }
    this._maDraft = same ? previous : createAnnotationDraft(c, this._annotationDocumentKey(), isNew);
    this._maEdit();
  }
  _maNewIdea() {
    const p = this._pending; if (!p?.quote) return null;
    const annotation = { ...p, type:'idea', note:'', reply:'' }; delete annotation.html; delete annotation.commentIds;
    if (this.activeAnswerRequestId) annotation.answerRequestId = this.activeAnswerRequestId;
    this._maStartEdit(annotation, true); return annotation;
  }
  _maEdit() {
    this._maMode = 'edit'; const draft = this._maDraft;
    const sheet = this._maShow(draft.isNew ? '写下想法' : '批注详情', !draft.isNew);
    if (!draft.isNew) sheet.appendChild(this._maText('p',this._typeLabel(draft.original.type) + ' · ' + new Date(draft.original.ts || Date.now()).toLocaleString(),'mobile-annotation-meta'));
    sheet.appendChild(this._maText('p', t('批注单独保存，不改动 Markdown 原文'), 'mobile-annotation-meta'));
    const quote = this._maText('blockquote', draft.original.quote, 'mobile-annotation-quote');
    quote.classList.add('is-collapsed'); sheet.appendChild(quote);
    const expand = this._maButton('展开原文', () => {quote.classList.toggle('is-collapsed'); expand.textContent = t(quote.classList.contains('is-collapsed') ? '展开原文' : '收起原文');});
    sheet.appendChild(expand);
    if (draft.original.type === 'ai') { sheet.appendChild(this._maText('p', draft.original.answer || '')); return; }
    const field = (key, label, attr) => {
      const l = document.createElement('label'); l.textContent = t(label);
      const ta = document.createElement('textarea'); ta.value = draft[key]; ta.setAttribute(attr, ''); ta.setAttribute('aria-label', t(label)); ta.spellcheck = false;
      ta.addEventListener('input', () => { draft[key] = ta.value; this._maStashDraft(); this._maDraftStatus.textContent = t(annotationDraftDirty(draft) ? '未保存' : '尚未修改'); });
      l.appendChild(ta); sheet.appendChild(l); return ta;
    };
    const note = field('note', '我的想法', 'data-mobile-note');
    if (!draft.isNew) {
      field('reply', '外部回答', 'data-mobile-reply');
      sheet.appendChild(this._maButton('粘贴回答', () => this._maPasteReply()));
      sheet.appendChild(this._maText('p', t('从其他工具粘贴回答，可继续编辑。'), 'mobile-annotation-meta'));
    }
    this._maDraftStatus = this._maText('p', t(annotationDraftDirty(draft) ? '未保存' : '尚未修改'), 'mobile-annotation-meta');
    sheet.appendChild(this._maDraftStatus);
    const actions = document.createElement('footer'); actions.className = 'mobile-annotation-form-actions';
    actions.append(this._maButton('取消', () => this._maRequestClose()), this._maButton(draft.isNew ? '保存批注' : '完成', () => this._maSave(), 'data-mobile-save'));
    sheet.appendChild(actions); this._maStashDraft();
    if (draft.isNew) setTimeout(() => note.focus({preventScroll:true}), 0);
  }
  _maSave() {
    const draft = this._maDraft;
    if (draft.isNew && !draft.note.trim()) { this._maError(t('写下一点想法后再保存')); return; }
    const result = commitAnnotationDraft(draft, this.comments, this._annotationDocumentKey());
    if (result.error) { this._maError(t('文档或批注已变化，草稿仍保留，请核对后重试')); return; }
    if (draft.isNew) this.comments.push(result.annotation);
    else this.comments = this.comments.map(c => c.id === result.annotation.id ? result.annotation : c);
    const previous = this.comments;
    // Keep the transactional buffer if the existing storage owner reports a failed write.
    if (this._persist(false) === false) {
      this.comments = draft.isNew ? previous.filter(c => c.id !== result.annotation.id) : previous.map(c => c.id === result.annotation.id ? draft.original : c);
      this._maError(t('保存失败，草稿仍保留，请重试或备份')); return;
    }
    if (this.agentBridgeEnabled) this._scheduleBridgeSync();
    this._maClearDraft(); this._maDraft = null; this._pending = null;
    window.getSelection()?.removeAllRanges(); this._renderPreview(); this._renderComments();
    this._maList(); this._setStatus(t('批注已保存'));
  }
  async _maPasteReply() {
    try {
      const text = await navigator.clipboard.readText();
      this._maDraft.reply = text; const input = this._maRoot.querySelector('[data-mobile-reply]'); input.value = text;
      input.dispatchEvent(new Event('input')); input.focus();
    } catch { this._maError(t('无法读取剪贴板，请长按输入框手动粘贴')); }
  }
  _maError(message) {
    let error = this._maRoot.querySelector('.mobile-annotation-error');
    if (!error) { error = document.createElement('p'); error.className = 'mobile-annotation-error'; error.setAttribute('role','alert'); this._maRoot.querySelector('.mobile-annotation-sheet').appendChild(error); }
    error.textContent = message;
  }
  _maConfirm(kind) {
    if (this._maRoot.querySelector('.mobile-annotation-confirm')) return;
    this._maConfirmFocus = document.activeElement;
    const body = this._maRoot.querySelector('.mobile-annotation-sheet'); body.inert = true;
    const confirm = document.createElement('section'); confirm.className = 'mobile-annotation-confirm'; confirm.setAttribute('role','alertdialog'); confirm.setAttribute('aria-modal','true');
    const title = kind === 'delete' ? '删除这条批注？' : '放弃尚未保存的修改？'; confirm.setAttribute('aria-label', t(title));
    confirm.appendChild(this._maText('h2',t(title)));
    const c = this.comments.find(c => c.id === this._maDeleteId);
    confirm.appendChild(this._maText('blockquote', kind === 'delete' ? c?.quote || '' : this._maDraft?.note || this._maDraft?.reply || '', 'mobile-annotation-quote'));
    confirm.appendChild(this._maText('p',t(kind === 'delete' ? '这条标记、想法和外部回答会一起删除，无法恢复。Markdown 原文不受影响。' : '已保存的批注与原文都不会改变')));
    const keep = this._maButton(kind === 'delete' ? '取消' : '继续编辑', () => this._maRemoveConfirm(), 'data-mobile-continue');
    const discard = this._maButton(kind === 'delete' ? '删除批注' : '放弃修改', async () => {
      if (kind === 'delete') { const id = this._maDeleteId; this._maRemoveConfirm(); await this._deleteComment(id, true); this._maList(); }
      else { const isNew = this._maDraft?.isNew; this._maClearDraft(); this._maDraft = null; this._maRemoveConfirm(); if (this._isMobileAnnotation() && !isNew) this._maList(); else this._maClose(); }
    }); discard.setAttribute('data-mobile-confirm',kind);
    confirm.append(keep,discard); this._maRoot.appendChild(confirm); keep.focus({preventScroll:true});
  }
  _maRemoveConfirm() { this._maRoot.querySelector('.mobile-annotation-confirm')?.remove(); this._maRoot.querySelector('.mobile-annotation-sheet').inert = false; const target = this._maConfirmFocus?.getClientRects().length ? this._maConfirmFocus : this._maRoot.querySelector('[data-mobile-close]');target?.focus({preventScroll:true}); }
  _maSelectionMore() {
    if (!this._pending?.quote) return;
    this._maMode = 'selection'; const sheet = this._maShow('更多操作');
    sheet.appendChild(this._maText('p',t('对所选文字执行操作'),'mobile-annotation-meta'));
    sheet.appendChild(this._maText('blockquote',this._pending.quote,'mobile-annotation-quote'));
    sheet.appendChild(this._maButton('复制文字', () => this._maCopyScreen(this._pending.quote)));
    sheet.appendChild(this._maButton('生成图片', () => {this._maClose(); this.openSelectionImage();}));
    sheet.appendChild(this._maText('p',t('仅使用所选原文生成摘录图片'),'mobile-annotation-meta'));
  }
  _maCopyScreen(text, annotation = null) {
    this._maCopyParent = this._maMode === 'selection' ? 'selection' : 'list';
    this._maMode = 'copy'; this._maCopyText = text;
    const sheet = this._maShow(this._maCopyParent === 'selection' ? '复制文字' : '复制批注',true);
    if (this._maCopyParent === 'list') {
      const ranges = document.createElement('div'); ranges.className = 'mobile-annotation-copy-ranges';
      const choose = value => {this._maCopyText=value;this._maRoot.querySelector('.mobile-annotation-copy-text').value=value;void this._maTryCopy();};
      if (annotation) ranges.appendChild(this._maButton('复制这条批注',()=>choose(this._commentText(annotation))));
      ranges.append(this._maButton('复制全部批注',()=>choose(this._allCommentsText())),this._maButton('复制完整内容',()=>choose(this._fullWithComments())));sheet.appendChild(ranges);
    }
    this._maCopyState = this._maText('p', '', 'mobile-annotation-meta'); this._maCopyState.setAttribute('role','status');sheet.appendChild(this._maCopyState);
    sheet.appendChild(this._maButton('重试复制', () => this._maTryCopy()));
    const ta = document.createElement('textarea'); ta.value=text;ta.readOnly=true;ta.setAttribute('aria-label',t('待复制内容'));ta.className='mobile-annotation-copy-text';
    sheet.appendChild(this._maButton('手动复制',()=>{ta.focus();ta.select();}));sheet.appendChild(ta);void this._maTryCopy();
  }
  async _maTryCopy() {
    try { await navigator.clipboard.writeText(this._maCopyText); this._maCopyState.classList.remove('is-error'); this._maCopyState.textContent=t('已复制'); }
    catch { this._maCopyState.classList.add('is-error'); this._maCopyState.textContent=t('未能写入剪贴板，可以重试或手动复制。原文和批注内容都没有改变。'); }
  }
  _disposeMobileAnnotations() {
    this._maStashDraft(); this._maRoot?.remove(); document.removeEventListener('keydown',this._maKey,true);
    window.removeEventListener('beforeunload',this._maUnload);window.removeEventListener('resize',this._maResize);
    window.visualViewport?.removeEventListener('resize',this._maResize);window.visualViewport?.removeEventListener('scroll',this._maResize);
    this.selBarRef.current?.removeEventListener('pointerdown',this._maPointer);
  }
}
