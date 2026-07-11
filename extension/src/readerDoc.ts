// Hand-off of the clipped document from the popup to the reader tab. Both run
// on the extension origin, so plain localStorage is enough — no extra
// permission needed.
export interface ReaderDoc {
  title: string;
  url: string;
  capturedAt: string;
  markdown: string;
}

const DOC_KEY = 'mojian-reader-doc';

export function storeReaderDoc(doc: ReaderDoc): boolean {
  try {
    localStorage.setItem(DOC_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false; // quota exceeded on huge pages
  }
}

export function loadReaderDoc(): ReaderDoc | null {
  try {
    const raw = localStorage.getItem(DOC_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw) as Partial<ReaderDoc>;
    if (typeof doc.markdown !== 'string' || typeof doc.title !== 'string') return null;
    return {
      title: doc.title,
      url: typeof doc.url === 'string' ? doc.url : '',
      capturedAt: typeof doc.capturedAt === 'string' ? doc.capturedAt : '',
      markdown: doc.markdown
    };
  } catch {
    return null;
  }
}
