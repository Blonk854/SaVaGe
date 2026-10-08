export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function parseXml(text: string): Document | null {
  const xml = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = xml.documentElement;
  if (!root || root.localName.toLowerCase() === "parsererror" || xml.querySelector("parsererror")) {
    return null;
  }
  return xml;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function hasNonWhitespaceText(el: Element): boolean {
  return Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
}

/** Two-space indentation. Elements containing text (e.g. <text>) are serialized inline, unchanged. Returns null for invalid XML. */
export function prettify(text: string): string | null {
  const xml = parseXml(text);
  if (!xml) return null;
  const serializer = new XMLSerializer();
  const out: string[] = [];
  const declaration = /^\s*<\?xml[^>]*\?>/.exec(text)?.[0].trim();
  if (declaration) out.push(declaration);
  const emit = (node: Node, depth: number) => {
    const pad = "  ".repeat(depth);
    if (node.nodeType === 8) {
      out.push(`${pad}<!--${node.textContent ?? ""}-->`);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const attrs = Array.from(el.attributes)
      .map((a) => ` ${a.name}="${escapeAttr(a.value)}"`)
      .join("");
    const name = el.tagName;
    if (hasNonWhitespaceText(el)) {
      out.push(pad + serializer.serializeToString(el));
      return;
    }
    const children = Array.from(el.childNodes).filter((n) => n.nodeType === 1 || n.nodeType === 8);
    if (!children.length) {
      out.push(`${pad}<${name}${attrs} />`);
      return;
    }
    out.push(`${pad}<${name}${attrs}>`);
    for (const child of children) emit(child, depth + 1);
    out.push(`${pad}</${name}>`);
  };
  emit(xml.documentElement, 0);
  return out.join("\n") + "\n";
}

/** Removes whitespace between tags. Text content with non-whitespace characters is untouched. */
export function minify(text: string): string | null {
  if (!parseXml(text)) return null;
  return text.replace(/>\s+</g, "><").trim();
}

const NUMERIC_ATTRS = new Set([
  "d", "points", "transform", "viewBox", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "opacity", "fill-opacity",
  "stroke-opacity", "font-size", "letter-spacing", "offset", "stdDeviation", "dx", "dy",
]);
const NUMBER_RE = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const ATTR_RE = /([\w:-]+)(\s*=\s*)("([^"]*)"|'([^']*)')/g;

export function formatNumber(n: number, precision: number): string {
  const rounded = Number(n.toFixed(precision));
  return (Object.is(rounded, -0) ? 0 : rounded).toString();
}

/**
 * Rounds numbers inside the whitelisted numeric attributes only. Colors, ids, names are never touched.
 * Known limitation: regex-based on purpose so the user's formatting is preserved exactly, which means
 * an attribute-looking string inside <text> content such as x="1.2345" would also be rounded.
 */
export function roundNumbers(text: string, precision: number): string | null {
  if (!parseXml(text)) return null;
  const p = Math.max(0, Math.min(4, Math.floor(precision)));
  return text.replace(ATTR_RE, (whole, name: string, eq: string, quoted: string, dq?: string, sq?: string) => {
    if (!NUMERIC_ATTRS.has(name)) return whole;
    const value = dq ?? sq ?? "";
    const rounded = value.replace(NUMBER_RE, (num) => formatNumber(Number(num), p));
    const quote = quoted[0];
    return `${name}${eq}${quote}${rounded}${quote}`;
  });
}
