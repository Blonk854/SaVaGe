// Lazy attrs so a self-closing "/" is left for the (\/)? group instead of being
// swallowed by the [^'">] branch.
const TAG_RE = /<(\/)?([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/)?>/g;
const ID_RE = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/;

export interface ElementSpan {
  id: string | null;
  /** Offset of "<". */
  start: number;
  /** Offset just past the closing ">" of the end tag (or of the self-closing tag). */
  end: number;
  /** 1-based line of the start tag. */
  line: number;
}

export function lineOfOffset(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export function offsetOfLine(text: string, line: number): number {
  if (line <= 1) return 0;
  let current = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 && ++current === line) return i + 1;
  }
  return text.length;
}

/** Spans of every element, using a simple tag tokenizer. Comments and PIs are ignored. */
export function elementSpans(text: string): ElementSpan[] {
  const spans: ElementSpan[] = [];
  const stack: { name: string; start: number; id: string | null; line: number }[] = [];
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(text))) {
    const [whole, closing, name, attrs, selfClosing] = m;
    const start = m.index;
    const end = start + whole.length;
    if (closing) {
      const idx = stack.map((s) => s.name).lastIndexOf(name);
      if (idx < 0) continue;
      const open = stack[idx];
      stack.length = idx;
      spans.push({ id: open.id, start: open.start, end, line: open.line });
      continue;
    }
    const idMatch = ID_RE.exec(attrs);
    const id = idMatch ? (idMatch[1] ?? idMatch[2] ?? null) : null;
    const line = lineOfOffset(text, start);
    if (selfClosing) spans.push({ id, start, end, line });
    else stack.push({ name, start, id, line });
  }
  for (const open of stack) spans.push({ id: open.id, start: open.start, end: text.length, line: open.line });
  return spans;
}

/** Innermost element (smallest span) containing the caret, that has an id. */
export function elementIdAtOffset(text: string, offset: number): string | null {
  let best: ElementSpan | null = null;
  for (const span of elementSpans(text)) {
    if (!span.id || offset < span.start || offset > span.end) continue;
    if (!best || span.end - span.start < best.end - best.start) best = span;
  }
  return best?.id ?? null;
}

/** 1-based line of the start tag carrying id="X" (or id='X'). */
export function lineOfElementId(text: string, id: string): number | null {
  const span = elementSpans(text).find((s) => s.id === id);
  return span ? span.line : null;
}
