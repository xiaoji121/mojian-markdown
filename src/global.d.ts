/// <reference types="vite/client" />

import type { createMarkdownEditorComponent } from './editor/MarkdownEditorLogic';

declare global {
  interface Window {
    React: any;
    ReactDOM: any;
    marked: any;
    createMarkdownEditorComponent: typeof createMarkdownEditorComponent;
  }
}

declare module './dc-runtime.js';

export {};
