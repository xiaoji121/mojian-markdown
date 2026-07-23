let editorEntryPromise: Promise<unknown> | null = null;

function loadEditorEntry() {
  if (!editorEntryPromise) editorEntryPromise = import('./editorEntry');
  return editorEntryPromise;
}

function loadEditorForCurrentRoute() {
  if (window.location.hash === '#editor') void loadEditorEntry();
}

loadEditorForCurrentRoute();
window.addEventListener('hashchange', loadEditorForCurrentRoute);
