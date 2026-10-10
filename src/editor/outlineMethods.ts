// @ts-nocheck
import { t } from './i18n.ts';

/** 大纲侧栏目录：全文标题树、点击跳转；首版隐藏右缘刻度。不改源文。 */
export class OutlineMethods {
  _initOutlinePanel() {
    this.outlinePanelOpen = false;
    if (this.outlineSidebarRef?.current) this.outlineSidebarRef.current.style.display = 'none';
    this._initOutlineResize();
  }

  _applyOutlinePanelWidth(width) {
    const aside = this.outlineSidebarRef?.current;
    const split = this.splitRef?.current;
    if (!aside) return;
    const max = Math.max(240, Math.min(560, window.innerWidth * 0.45));
    this.commentsPanelWidth = Math.round(Math.max(240, Math.min(max, width || this.commentsPanelWidth || 360)));
    aside.style.width = this.commentsPanelWidth + 'px';
    if (this.outlinePanelOpen && split) {
      split.style.setProperty('--active-side-panel-width', this.commentsPanelWidth + 'px');
    }
    this._syncWorkspacePanelWidth?.();
  }

  _initOutlineResize() {
    const handle = this.outlineResizeRef?.current;
    if (!handle) return;
    let dragging = false;
    const move = (e) => {
      if (dragging) this._applyOutlinePanelWidth(window.innerWidth - e.clientX);
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (window.mojianDesktop) this._persist(false);
      try { localStorage.setItem('md-editor-comments-panel-width', String(this.commentsPanelWidth)); } catch (e) {}
    };
    handle.addEventListener('mousedown', (e) => {
      if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) return;
      dragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  _openOutlinePanel(show) {
    const aside = this.outlineSidebarRef?.current;
    if (!aside) return;
    this.outlinePanelOpen = (show === undefined || show === null) ? !this.outlinePanelOpen : !!show;
    aside.style.display = this.outlinePanelOpen ? 'flex' : 'none';
    if (this.outlinePanelOpen) {
      const sharedWidth = this.aiPanelOpen ? this.aiPanelWidth : this.commentsPanelWidth;
      this._applyOutlinePanelWidth(sharedWidth);
      if (this.panelOpen) {
        this.panelOpen = false;
        if (this.commentsRef?.current) this.commentsRef.current.style.display = 'none';
      }
      if (this.aiPanelOpen) {
        this.aiPanelOpen = false;
        if (this.aiPanelRef?.current) this.aiPanelRef.current.style.display = 'none';
      }
      this._renderOutline();
    }
    this._syncFullscreenLayout?.();
  }

  _outlineSlug(text, index, used) {
    const base = String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section-' + (index + 1);
    let value = 'outline-' + base;
    let suffix = 2;
    while (used.has(value)) value = 'outline-' + base + '-' + suffix++;
    used.add(value);
    return value;
  }

  _outlineSummary(heading) {
    const parts = [];
    let node = heading.nextElementSibling;
    while (node && !/^H[1-6]$/.test(node.tagName) && parts.length < 2) {
      const listItems = Array.from(node.querySelectorAll?.(':scope > li') || []);
      const text = (listItems.length ? listItems.map((item) => item.textContent).join(' · ') : node.textContent)
        .replace(/\s+/g, ' ').trim();
      if (text) parts.push(text);
      node = node.nextElementSibling;
    }
    const summary = parts.join(' · ') || t('这一段暂时没有正文内容。');
    return summary.length > 140 ? summary.slice(0, 137).trimEnd() + '…' : summary;
  }

  _outlineTreeItem(heading, title, index) {
    const level = Math.min(6, Math.max(1, Number(heading.tagName.slice(1)) || 1));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'outline-tree-item';
    button.dataset.outlineTarget = heading.id;
    button.dataset.outlineTitle = title;
    button.dataset.outlineIndex = String(index);
    button.dataset.outlineLevel = String(level);
    button.style.setProperty('--outline-level', String(level));
    button.title = title;
    button.setAttribute('aria-label', t('跳到：{title}', { title }));
    button.textContent = title;
    button.addEventListener('click', () => this._jumpToOutlineHeading(heading));
    return button;
  }

  _renderOutline() {
    const preview = this.previewRef?.current;
    const tree = this.outlineTreeRef?.current;
    if (!preview || !tree) return;
    const headings = Array.from(preview.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const used = new Set();
    tree.innerHTML = '';
    if (!headings.length) {
      const empty = document.createElement('p');
      empty.className = 'outline-tree-empty';
      empty.textContent = t('本文暂无标题');
      tree.appendChild(empty);
      return;
    }
    headings.forEach((heading, index) => {
      heading.id = this._outlineSlug(heading.textContent, index, used);
      heading.dataset.outlineIndex = String(index);
      const title = heading.textContent.trim() || t('未命名标题');
      tree.appendChild(this._outlineTreeItem(heading, title, index));
    });
    this._syncActiveOutlineItem();
  }

  _jumpToOutlineHeading(heading) {
    this._outlineJumpTarget = heading.id;
    this._scrollPreviewTo(heading);
    this._setActiveOutlineItem(heading.id, true);
    clearTimeout(this._outlineJumpT);
    this._outlineJumpT = setTimeout(() => {
      this._outlineJumpTarget = '';
      this._syncActiveOutlineItem();
    }, 700);
  }

  _setActiveOutlineItem(targetId, scrollItem) {
    const tree = this.outlineTreeRef?.current;
    if (!tree) return;
    const items = Array.from(tree.querySelectorAll('.outline-tree-item'));
    items.forEach((item) => {
      const active = item.dataset.outlineTarget === targetId;
      item.classList.toggle('is-active', active);
      if (active) {
        item.setAttribute('aria-current', 'location');
        if (scrollItem && typeof item.scrollIntoView === 'function') {
          item.scrollIntoView({ block: 'nearest' });
        }
      } else {
        item.removeAttribute('aria-current');
      }
    });
  }

  _syncActiveOutlineItem() {
    const preview = this.previewRef?.current;
    if (!preview) return;
    const headings = Array.from(preview.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    if (!headings.length) return;
    if (this._outlineJumpTarget) {
      this._setActiveOutlineItem(this._outlineJumpTarget);
      return;
    }
    if (preview.scrollTop + preview.clientHeight >= preview.scrollHeight - 8) {
      this._setActiveOutlineItem(headings[headings.length - 1].id);
      return;
    }
    const previewTop = preview.getBoundingClientRect().top;
    const marker = previewTop + 80;
    let active = headings[0];
    let distance = Math.abs(active.getBoundingClientRect().top - marker);
    headings.slice(1).forEach((heading) => {
      const nextDistance = Math.abs(heading.getBoundingClientRect().top - marker);
      if (nextDistance < distance) {
        active = heading;
        distance = nextDistance;
      }
    });
    this._setActiveOutlineItem(active.id);
  }
}
