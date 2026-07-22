// 编辑器 CSS 由 index.html 以 <link> 阻塞式引入（避免 JS 注入造成的无样式闪烁）
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { marked } from 'marked';
import { createMarkdownEditorComponent } from './editor/MarkdownEditorLogic';

window.React = React;
window.ReactDOM = ReactDOM;
window.marked = marked;
window.createMarkdownEditorComponent = createMarkdownEditorComponent;

// The bundled DC runtime is generated JavaScript without declaration files.
// @ts-expect-error generated runtime module
await import('./dc-runtime.js');
