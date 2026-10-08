import { initLandingNavigation } from './landing/navigation';
import { syncDesktopLanding } from './landing/desktopLanding';

let editorEntryPromise: Promise<unknown> | null = null;

function loadEditorEntry() {
  if (!editorEntryPromise) editorEntryPromise = import('./editorEntry');
  return editorEntryPromise;
}

function loadEditorForCurrentRoute() {
  syncDesktopLanding();
  if (window.location.hash === '#editor') void loadEditorEntry();
}

initLandingNavigation();
loadEditorForCurrentRoute();
window.addEventListener('hashchange', loadEditorForCurrentRoute);
