// @ts-nocheck
import { t } from './i18n.ts';

// Desktop controls reuse the textarea's existing formatting, history and search paths.
export class DesktopEditingMethods {
  _pcDesktop() { return typeof window !== 'undefined' && window.matchMedia('(min-width:761px)').matches; }

  _initDesktopEditing() {
    const actions = document.querySelector('.source-toolbar-actions');
    if (!actions || this._pcFormatButton) return;
    const button = document.createElement('button');
    button.className = 'tbtn pc-format-toggle pc-editing-only';
    button.dataset.i18n = '格式'; button.textContent = t('格式');
    button.setAttribute('aria-haspopup','menu'); button.setAttribute('aria-expanded','false');
    button.addEventListener('click', () => this._pcToggleFormat());
    const menu = document.createElement('div');
    menu.className = 'pc-format-menu pc-editing-only'; menu.role = 'menu'; menu.hidden = true;
    const commands = [
      ['标题', () => this._linePrefix('## ')], ['加粗', () => this._wrapSel('**','**','粗体')],
      ['斜体', () => this._wrapSel('*','*','斜体')], ['引用', () => this._linePrefix('> ')],
      ['列表', () => this._linePrefix('- ')], ['代码', () => this._wrapSel('`','`','code')],
      ['链接', () => this._wrapSel('[','](https://)','链接文字')]
    ];
    commands.forEach(([label, action]) => {
      const item = document.createElement('button'); item.role = 'menuitem';
      item.dataset.i18n = label; item.textContent = t(label);
      item.addEventListener('click', () => { this._pcToggleFormat(false); action(); });
      menu.append(item);
    });
    actions.append(button,menu); this._pcFormatButton = button; this._pcFormatMenu = menu;
    this._pcEditingOutside = event => {
      if (!actions.contains(event.target)) this._pcToggleFormat(false);
    };
    document.addEventListener('pointerdown',this._pcEditingOutside);
    this._pcEditingResize = () => {
      if (!this._pcDesktop()) {
        const menuFocused = this._pcFormatMenu?.contains(document.activeElement);
        this._pcToggleFormat(false); this._pcCloseDialog?.();
        if (menuFocused) [...document.querySelectorAll('.mobile-menu-toggle')].find(node=>node.getClientRects().length)?.focus({preventScroll:true});
      }
      this._renderSourceHighlights?.();
      this._syncDesktopSearch(); this._pcSyncCommentView?.();
    };
    window.addEventListener('resize', this._pcEditingResize);
    const feedback = document.createElement('div');
    feedback.className = 'pc-search-feedback pc-editing-only'; feedback.role = 'status';
    this.searchBarRef.current?.querySelector('.search-bar-rows')?.append(feedback);
    this._pcSearchFeedback = feedback;
    this._syncDesktopSearch();
  }

  _pcToggleFormat(force, focus = false) {
    if (!this._pcFormatMenu) return;
    const open = typeof force === 'boolean' ? force : this._pcFormatMenu.hidden;
    this._pcFormatMenu.hidden = !open;
    this._pcFormatButton.setAttribute('aria-expanded', String(open));
    if (open) this._pcFormatMenu.querySelector('button')?.focus({preventScroll:true});
    else if (focus) this._pcFormatButton.focus({preventScroll:true});
  }

  _handleDesktopEditingKey(event) {
    if (!this._pcDesktop()) return false;
    if (this._pcHandleDialogKey?.(event)) return true;
    if (event.target === this._pcFormatButton && ['ArrowDown','ArrowUp'].includes(event.key)) {
      event.preventDefault(); this._pcToggleFormat(true); return true;
    }
    if (this._pcFormatMenu && !this._pcFormatMenu.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); this._pcToggleFormat(false,true); return true; }
      if (event.key === 'Tab') { this._pcToggleFormat(false); return false; }
      const items = [...this._pcFormatMenu.querySelectorAll('button')];
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : (items.indexOf(document.activeElement) + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        event.preventDefault(); items[index].focus(); return true;
      }
    }
    if (event.key === 'Escape' && this._pcCommentEditor && this.commentsRef.current?.contains(event.target)) {
      event.preventDefault(); this._pcCloseCommentEditor(true); return true;
    }
    if (event.key === 'Escape' && this.selBarRef.current?.getClientRects().length) {
      event.preventDefault(); this.selBarRef.current.style.display = 'none'; return true;
    }
    return false;
  }

  _syncDesktopSearch() {
    if (!this._pcDesktop()) return;
    const invalid = this.searchOpen && this._searchRegexInvalid;
    this.searchBarRef.current?.querySelectorAll('.search-tool:not(.search-close)').forEach(button => {
      button.disabled = !this._searchMatches?.length || invalid;
    });
    this.searchInputRef.current?.setAttribute('aria-invalid', String(!!invalid));
    if (this._pcSearchFeedback) {
      this._pcSearchFeedback.textContent = invalid ? t('正则表达式无效；请修正后再替换。') : '';
      this._pcSearchFeedback.hidden = !invalid;
    }
  }

  _pcPreviewSearchReturn() {
    if (!this._pcDesktop()) return;
    const opener = this._pcPreviewSearchOpener;
    if (opener?.isConnected && opener.getClientRects().length) opener.focus({preventScroll:true});
    else document.querySelector('.reading-toolbar button[data-i18n-aria-label="查找文档"]')?.focus({preventScroll:true});
  }

  _disposeDesktopEditing() {
    document.removeEventListener('pointerdown',this._pcEditingOutside);
    window.removeEventListener('resize',this._pcEditingResize);
    this._pcCloseDialog?.();
  }
}
