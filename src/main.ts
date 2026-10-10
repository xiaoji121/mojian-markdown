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

// Prefer marketing locale only when the user saw the landing before #editor.
// Direct /#editor deep links (and navigator-based E2E) keep browser language.
if (window.location.hash !== '#editor') {
  document.documentElement.dataset.preferLandingLocale = '1';
}
initLandingNavigation();
loadEditorForCurrentRoute();
window.addEventListener('hashchange', loadEditorForCurrentRoute);
