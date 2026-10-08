// @ts-nocheck
import { isReadingFont, resolveReadingFont, readingScript } from '../fonts/readingFont.ts';

export class ReadingFontMethods {
  _initReadingFont(saved) {
    this.readingFont = resolveReadingFont(saved);
    this._readingFontSelect = document.querySelector('.reading-font-select');
    this._readingFontChange = () => {
      const value = this._readingFontSelect.value;
      if (!isReadingFont(value)) return;
      this.readingFont = value;
      this._applyReadingFont();
      this._persist(false);
    };
    this._readingFontSelect?.addEventListener('change', this._readingFontChange);
    this._applyReadingFont();
  }

  _applyReadingFont() {
    document.body.setAttribute('data-reading-font', this.readingFont);
    if (this._readingFontSelect) this._readingFontSelect.value = this.readingFont;
    const note = document.querySelector('.reading-font-note');
    if (note) note.hidden = this.readingFont !== 'local-jinkai';
    const preview = document.querySelector('.reading-font-preview');
    if (preview) preview.setAttribute('data-reading-font', this.readingFont);
  }

  _syncReadingScript() {
    const preview = this.previewRef.current;
    if (!preview) return;
    const script = readingScript(preview.textContent || '');
    preview.style.setProperty('--paper-line-height', script === 'cjk' ? '1.95' : '1.7');
    preview.style.setProperty('--paper-letter-spacing', '0');
    preview.setAttribute('data-reading-script', script);
  }

  _disposeReadingFont() {
    this._readingFontSelect?.removeEventListener('change', this._readingFontChange);
  }
}
