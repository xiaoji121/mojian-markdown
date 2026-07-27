/// <reference types="vite/client" />

import type { createMarkdownEditorComponent } from './editor/MarkdownEditorLogic';
import type { MojianDesktopApi } from './editor/desktopFileHandle';

declare global {
  interface Window {
    React: any;
    ReactDOM: any;
    marked: any;
    createMarkdownEditorComponent: typeof createMarkdownEditorComponent;
    /** Electron 桌面端由 preload 注入；网页版不存在。 */
    mojianDesktop?: MojianDesktopApi;
  }
}

declare module './dc-runtime.js';

export {};
