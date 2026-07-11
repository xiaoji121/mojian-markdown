// Snapshot function injected into the current page via
// chrome.scripting.executeScript({ func }). Only the function's source text is
// serialized into the page, so it must stay fully self-contained: no imports
// and no references to anything in module scope.
export interface PageSnapshot {
  url: string;
  title: string;
  html: string;
  selectionHtml: string;
}

export function capturePageSnapshot(): PageSnapshot {
  const root = document.documentElement.cloneNode(true) as HTMLElement;

  // The clone keeps raw attributes only, so lazy-loaded images may still point
  // at placeholders. The live elements know the real URL via currentSrc.
  const liveImages = Array.from(document.querySelectorAll('img'));
  const cloneImages = Array.from(root.querySelectorAll('img'));
  for (let i = 0; i < cloneImages.length && i < liveImages.length; i++) {
    const live = liveImages[i];
    const clone = cloneImages[i];
    const lazy =
      live.getAttribute('data-src') ||
      live.getAttribute('data-original') ||
      live.getAttribute('data-lazy-src') ||
      '';
    let source = live.currentSrc || '';
    if ((!source || source.startsWith('data:')) && lazy) {
      try {
        source = new URL(lazy, document.baseURI).href;
      } catch {
        source = lazy;
      }
    }
    if (!source) source = live.src;
    if (source) clone.setAttribute('src', source);
    clone.removeAttribute('srcset');
    clone.removeAttribute('sizes');
    clone.removeAttribute('loading');
  }

  for (const junk of root.querySelectorAll('script, style, noscript, template, link[rel="stylesheet"]')) {
    junk.remove();
  }

  let selectionHtml = '';
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) {
    const holder = document.createElement('div');
    for (let i = 0; i < selection.rangeCount; i++) {
      holder.appendChild(selection.getRangeAt(i).cloneContents());
    }
    selectionHtml = holder.innerHTML;
  }

  return {
    url: location.href,
    title: document.title,
    html: root.outerHTML,
    selectionHtml
  };
}
