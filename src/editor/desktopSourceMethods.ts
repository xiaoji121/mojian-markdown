// @ts-nocheck

const escape = text => text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Only presentation is mirrored. The native textarea remains the sole editable value.
export function desktopSourceLines(value, matches = [], current = -1) {
  let offset = 0, cursor = 0, fenced = false;
  return value.split('\n').map((line,index)=>{
    const start = offset, end = start + line.length; offset = end + 1;
    while (cursor < matches.length && matches[cursor].end <= start) cursor++;
    let at = start, html = '';
    for (let i = cursor; i < matches.length && matches[i].start < end; i++) {
      const from = Math.max(start,matches[i].start), to = Math.min(end,matches[i].end);
      html += escape(value.slice(at,from)) + '<mark class="source-mark' + (i === current ? ' is-current' : '') + '">' + escape(value.slice(from,to)) + '</mark>';
      at = to;
    }
    html += escape(value.slice(at,end));
    const fence = /^\s*(```|~~~)/.test(line);
    const kind = fence || fenced ? 'code' : /^\s{0,3}(#{1,6}\s|>)/.test(line) ? 'structure' : '';
    if (fence) fenced = !fenced;
    return `<span class="pc-source-line" data-line="${index+1}" data-syntax="${kind}">${html || '\u200b'}</span>`;
  }).join('');
}

export class DesktopSourceMethods {
  _pcRenderSource() {
    const source = this.sourceRef.current, layer = this.sourceHighlightRef?.current;
    if (!source || !layer) return false;
    const desktop = this._pcDesktop();
    source.parentElement.classList.toggle('pc-source-ready',desktop);
    if (!desktop) return false;
    layer.style.fontSize = source.style.fontSize || '';
    layer.innerHTML = desktopSourceLines(source.value,this.searchOpen ? this._searchMatches || [] : [],this._searchIndex);
    layer.scrollTop = source.scrollTop; layer.scrollLeft = source.scrollLeft;
    return true;
  }
}
