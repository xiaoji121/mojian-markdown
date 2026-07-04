// Turndown has no built-in table support: without these rules a <table> edited
// in the preview pane collapses into plain text lines when synced back to the
// Markdown source. GFM table cells cannot contain raw "|" or newlines, so cell
// text escapes pipes and encodes line breaks as <br>.
import type TurndownService from 'turndown';

export function addTableRules(td: TurndownService) {
  td.addRule('tableCell', {
    filter: ['th', 'td'],
    replacement: (content, node) => serializeCell(content, node as HTMLElement)
  });
  td.addRule('tableRow', {
    filter: 'tr',
    replacement: (content, node) => {
      const row = node as HTMLTableRowElement;
      const suffix = isHeadingRow(row) ? '\n' + delimiterRow(row) : '';
      return '\n' + content + suffix;
    }
  });
  td.addRule('tableSection', {
    filter: ['thead', 'tbody', 'tfoot'],
    replacement: (content) => content
  });
  td.addRule('table', {
    filter: 'table',
    replacement: (content, node) => {
      const rows = content.replace(/\n+/g, '\n').replace(/^\n+|\n+$/g, '');
      if (!rows) return '';
      const table = node as HTMLTableElement;
      const header = tableHasHeadingRow(table) ? '' : syntheticHeader(table);
      return '\n\n' + header + rows + '\n\n';
    }
  });
}

function serializeCell(content: string, cell: HTMLElement): string {
  const prefix = cell.previousElementSibling ? ' ' : '| ';
  const spanPadding = ' |'.repeat(columnSpan(cell) - 1);
  return prefix + cellText(content) + ' |' + spanPadding;
}

function cellText(content: string): string {
  return content
    .trim()
    .replace(/\s*\n\s*/g, '<br>')
    .replace(/\|/g, '\\|');
}

function columnSpan(cell: Element): number {
  const span = parseInt(cell.getAttribute('colspan') || '1', 10);
  return Number.isFinite(span) && span > 1 ? span : 1;
}

function isHeadingRow(row: HTMLTableRowElement): boolean {
  const parent = row.parentNode as Element | null;
  if (!parent) return false;
  if (parent.nodeName === 'THEAD') return true;
  const cells = Array.from(row.children);
  return (
    parent.nodeName === 'TABLE' &&
    parent.firstElementChild === row &&
    cells.length > 0 &&
    cells.every((cell) => cell.nodeName === 'TH')
  );
}

function delimiterRow(row: HTMLTableRowElement): string {
  const markers = Array.from(row.children).flatMap((cell) =>
    new Array<string>(columnSpan(cell)).fill(alignmentMarker(cell))
  );
  return '| ' + markers.join(' | ') + ' |';
}

function alignmentMarker(cell: Element): string {
  const align = (cell.getAttribute('align') || (cell as HTMLElement).style.textAlign || '').toLowerCase();
  if (align === 'left') return ':---';
  if (align === 'right') return '---:';
  if (align === 'center') return ':---:';
  return '---';
}

function tableHasHeadingRow(table: HTMLTableElement): boolean {
  const first = table.querySelector('tr');
  return !!first && isHeadingRow(first);
}

function syntheticHeader(table: HTMLTableElement): string {
  const first = table.querySelector('tr');
  if (!first) return '';
  const columns = Array.from(first.children).reduce((count, cell) => count + columnSpan(cell), 0);
  if (!columns) return '';
  return '|' + '   |'.repeat(columns) + '\n' + '|' + ' --- |'.repeat(columns) + '\n';
}
