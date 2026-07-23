// Vite waits for these editor-only styles before evaluating this module, so the
// mounted editor is styled on its first frame without burdening the landing page.
import './editor/styles.css';
import './editor/shell.css';

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
