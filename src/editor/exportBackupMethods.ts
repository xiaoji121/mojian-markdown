// @ts-nocheck
// Static-web backup downloads + leave confirmations. Annotations never write into source .md.
import { t, getLocale } from './i18n.ts';
import { isPristineSample } from './sample.ts';
import { buildStoredZip } from './longImageComposer.ts';
import {
  annotationsMarkdownFileName,
  backupZipFileName,
  buildBackupPackageFiles,
  formatAnnotationsMarkdown,
  shouldConfirmLeave,
  sourceMarkdownFileName
} from './annotationExport.ts';

export class ExportBackupMethods {
  _initUnloadGuard() {
    if (this._beforeUnloadHandler || typeof window === 'undefined') return;
    this._beforeUnloadHandler = (event) => {
      if (!this._shouldConfirmLeave()) return;
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', this._beforeUnloadHandler);
  }

  _disposeUnloadGuard() {
    if (!this._beforeUnloadHandler || typeof window === 'undefined') return;
    window.removeEventListener('beforeunload', this._beforeUnloadHandler);
    this._beforeUnloadHandler = null;
  }

  _shouldConfirmLeave() {
    const content = this.sourceRef?.current?.value || '';
    return shouldConfirmLeave({
      hasFile: !!(this.fileHandle || this.localFilePath),
      dirty: !!this.dirty,
      content,
      commentCount: Array.isArray(this.comments) ? this.comments.length : 0,
      pristineSample: isPristineSample(content, this.fileName || '')
    });
  }

  _downloadTextFile(text, fileName, mime = 'text/markdown;charset=utf-8') {
    const blob = new Blob([text], { type: mime });
    this._downloadBlob(blob, fileName);
  }

  _downloadBlob(blob, fileName) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  _annotationTypeLabel(type) {
    if (typeof this._typeLabel === 'function') return this._typeLabel(type);
    return type || t('批注');
  }

  /** Pure source .md only — no annotations embedded. */
  downloadSourceMarkdown() {
    const src = this.sourceRef?.current?.value ?? '';
    const name = sourceMarkdownFileName(this.fileName || '未命名.md');
    this._downloadTextFile(src, name);
    this._setStatus(t('✓ 已下载纯源文 {name}', { name }));
  }

  /** Annotations Markdown export (title + quotes + ideas + time). Source untouched. */
  downloadAnnotationsMarkdown() {
    const md = formatAnnotationsMarkdown(
      this.fileName || '未命名.md',
      this.comments || [],
      (type) => this._annotationTypeLabel(type),
      getLocale()
    );
    const name = annotationsMarkdownFileName(this.fileName || '未命名.md');
    this._downloadTextFile(md, name);
    this._setStatus(t('✓ 已下载批注 {name}', { name }));
  }

  /** One-click zip: pure source + annotations.md + annotations.json sidecar. */
  async downloadFullBackup() {
    const src = this.sourceRef?.current?.value ?? '';
    const files = buildBackupPackageFiles(
      this.fileName || '未命名.md',
      src,
      this.comments || [],
      (type) => this._annotationTypeLabel(type),
      getLocale()
    );
    const zip = await buildStoredZip(files.map((file) => ({
      name: file.name,
      data: new Blob([file.text], { type: 'text/plain;charset=utf-8' })
    })));
    const name = backupZipFileName(this.fileName || '未命名.md');
    this._downloadBlob(zip, name);
    this._setStatus(t('✓ 已下载备份包 {name}', { name }));
  }
}
