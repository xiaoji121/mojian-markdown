// @ts-nocheck
// N-D guide layer: L2 empty state, L3 one-shot first-paragraph highlight, complete toast.
// Spec: designer/规格-首登5分钟-ND.md. No L4 bubble. No AI. Annotations never write back.
import { t } from './i18n.ts';
import {
  canCompleteNd,
  isNdGuideWindow,
  loadNdGuideFlags,
  markNdComplete,
  markNdHintDismissed,
  shouldShowNdFirstHighlight
} from './onboarding.ts';

const FIRST_HIGHLIGHT_MS = 4500;

export class OnboardingMethods {
  _initOnboarding() {
    const flags = loadNdGuideFlags();
    this._ndComplete = flags.complete;
    this._ndHintDismissed = flags.hintDismissed;
    this._ndSessionAnnotated = Array.isArray(this.comments) && this.comments.length > 0;
    this._ndSessionExported = false;
    this._ndFirstHighlightTimer = null;
    this._ndGuideActive = isNdGuideWindow({
      startedWithSample: !!this._startedWithSample,
      complete: !!this._ndComplete,
      hasOpenFile: !!(this.fileHandle || this.localFilePath)
    });

    this._syncNdNewButton?.();
    this._syncCommentPanelActions?.();

    if (this._ndGuideActive) {
      // G5: prefer reading/preview so first-run focus stays on highlighting, not editing.
      if (this.viewMode !== 'preview' && typeof this.setViewMode === 'function') {
        this.setViewMode('preview');
      }
      requestAnimationFrame(() => this._maybeNdFirstParagraphHighlight());
    }
  }

  _isNdGuideActive() {
    return isNdGuideWindow({
      startedWithSample: !!this._startedWithSample,
      complete: !!this._ndComplete,
      hasOpenFile: !!(this.fileHandle || this.localFilePath)
    });
  }

  /** N9: S0 demote「新建」from Primary to Secondary. */
  _syncNdNewButton() {
    const root = this.documentSidebarRef?.current;
    if (!root || !root.querySelector) return;
    // Prefer the onNew button: first .abtn in file actions (index.html order).
    const newBtn = root.querySelector('.workspace-file-actions .abtn');
    if (!newBtn) return;
    const demote = this._isNdGuideActive();
    newBtn.classList.toggle('primary', !demote);
    newBtn.classList.toggle('secondary', demote);
  }

  /** L2: hide list-dependent actions when empty (DESIGN_SPEC 3.2). */
  _syncCommentPanelActions() {
    const panel = this.commentsRef?.current;
    if (!panel || !panel.querySelector) return;
    const actions = panel.querySelector('.panel-actions');
    if (!actions) return;
    const empty = !Array.isArray(this.comments) || this.comments.length === 0;
    actions.hidden = empty;
    actions.style.display = empty ? 'none' : '';
  }

  /** L2 empty state copy — always when comments.length === 0. */
  _renderNdCommentsEmpty(list) {
    if (!list) return;
    const wrap = document.createElement('div');
    wrap.className = 'comments-empty-state';
    wrap.setAttribute('data-nd-empty', '1');

    const main = document.createElement('p');
    main.className = 'comments-empty-main';
    main.textContent = t('在预览里选中一句，点马克笔或「写想法」，会出现在这里。');

    const sub = document.createElement('p');
    sub.className = 'comments-empty-sub';
    sub.textContent = t('批注不会写回源文。');

    wrap.appendChild(main);
    wrap.appendChild(sub);

    const tryBtn = document.createElement('button');
    tryBtn.type = 'button';
    tryBtn.className = 'comments-empty-cta';
    tryBtn.textContent = t('去预览试试');
    tryBtn.addEventListener('click', () => this._focusPreviewForNd?.());
    wrap.appendChild(tryBtn);

    list.appendChild(wrap);
  }

  _focusPreviewForNd() {
    if (this.viewMode === 'editor' && typeof this.setViewMode === 'function') {
      this.setViewMode('preview');
    }
    const prev = this.previewRef?.current;
    if (!prev) return;
    const target = prev.querySelector('.nd-first-highlight')
      || prev.querySelector('p')
      || prev;
    try {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {
      target.scrollIntoView?.(true);
    }
    if (typeof target.focus === 'function') {
      try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  }

  _maybeNdFirstParagraphHighlight() {
    if (!shouldShowNdFirstHighlight({
      startedWithSample: !!this._startedWithSample,
      complete: !!this._ndComplete,
      hintDismissed: !!this._ndHintDismissed,
      hasOpenFile: !!(this.fileHandle || this.localFilePath)
    })) return;
    const prev = this.previewRef?.current;
    if (!prev || !prev.querySelector) return;
    // Prefer first paragraph under「三步开始」, else first body paragraph.
    let target = null;
    const headings = prev.querySelectorAll('h2, h1');
    for (const h of headings) {
      if (/三步|Three steps|3 ステップ|三步開始/i.test(h.textContent || '')) {
        let n = h.nextElementSibling;
        while (n && n.tagName !== 'P' && n.tagName !== 'OL' && n.tagName !== 'UL') n = n.nextElementSibling;
        if (n) {
          target = n.tagName === 'P' ? n : (n.querySelector('li') || n);
        }
        break;
      }
    }
    if (!target) target = prev.querySelector('p');
    if (!target) return;

    this._clearNdFirstHighlight();
    target.classList.add('nd-first-highlight');
    this._ndHighlightEl = target;

    const dismiss = () => this._dismissNdFirstHighlight();
    this._ndHighlightDismissers = [
      ['pointerdown', dismiss],
      ['keydown', (e) => { if (e.key === 'Escape') dismiss(); }]
    ];
    this._ndHighlightDismissers.forEach(([type, fn]) => {
      document.addEventListener(type, fn, true);
    });
    // Selection in preview also clears (user started step 1).
    prev.addEventListener('mouseup', dismiss, { once: true });

    clearTimeout(this._ndFirstHighlightTimer);
    this._ndFirstHighlightTimer = setTimeout(dismiss, FIRST_HIGHLIGHT_MS);
  }

  _clearNdFirstHighlight() {
    clearTimeout(this._ndFirstHighlightTimer);
    this._ndFirstHighlightTimer = null;
    if (this._ndHighlightEl) {
      this._ndHighlightEl.classList.remove('nd-first-highlight');
      this._ndHighlightEl = null;
    }
    if (this._ndHighlightDismissers) {
      this._ndHighlightDismissers.forEach(([type, fn]) => {
        document.removeEventListener(type, fn, true);
      });
      this._ndHighlightDismissers = null;
    }
  }

  _dismissNdFirstHighlight() {
    this._clearNdFirstHighlight();
    if (!this._ndHintDismissed) {
      this._ndHintDismissed = true;
      markNdHintDismissed();
    }
  }

  _noteNdAnnotated() {
    this._ndSessionAnnotated = true;
    return this._maybeNdComplete();
  }

  _noteNdExported() {
    this._ndSessionExported = true;
    return this._maybeNdComplete();
  }

  _maybeNdComplete() {
    if (this._ndComplete) return false;
    const annotated = this._ndSessionAnnotated
      || (Array.isArray(this.comments) && this.comments.length > 0);
    if (!canCompleteNd(annotated, !!this._ndSessionExported)) return false;
    this._ndComplete = true;
    markNdComplete();
    this._dismissNdFirstHighlight();
    this._syncNdNewButton?.();
    // One merged celebrate toast (≤5s); do not stack with a second backup toast.
    this._setStatus?.(t('✓ 批注已带走 · 备份包在下载文件夹'));
    return true;
  }
}
