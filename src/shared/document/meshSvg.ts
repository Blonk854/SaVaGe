import type { MeshGradientPaint } from "./types";

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function meshIndex(columns: number, col: number, row: number): number {
  return row * (columns + 1) + col;
}

function cubicRel(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return `c ${dx / 3},${dy / 3} ${(2 * dx) / 3},${(2 * dy) / 3} ${dx},${dy}`;
}

/** SVG 2 / Inkscape-compatible bilinear meshgradient. */
export function serializeMeshGradientDef(paint: MeshGradientPaint, id: string): string {
  const origin = paint.points[0] ?? { x: 0, y: 0, color: "#000000", opacity: 1 };
  const payload = escapeXml(
    JSON.stringify({
      columns: paint.columns,
      rows: paint.rows,
      points: paint.points,
    }),
  );
  const rows: string[] = [];
  for (let row = 0; row < paint.rows; row++) {
    const patches: string[] = [];
    for (let col = 0; col < paint.columns; col++) {
      const p00 = paint.points[meshIndex(paint.columns, col, row)];
      const p10 = paint.points[meshIndex(paint.columns, col + 1, row)];
      const p11 = paint.points[meshIndex(paint.columns, col + 1, row + 1)];
      const p01 = paint.points[meshIndex(paint.columns, col, row + 1)];
      if (!p00 || !p10 || !p11 || !p01) continue;
      const corners = [p00, p10, p11, p01, p00];
      const stops = corners.slice(0, 4).map((p, i) => {
        const next = corners[i + 1];
        return `<stop offset="${i / 3}" stop-color="${p.color}" stop-opacity="${p.opacity}" path="${cubicRel(p, next)}" />`;
      });
      patches.push(`<meshpatch>${stops.join("")}</meshpatch>`);
    }
    rows.push(`<meshrow>${patches.join("")}</meshrow>`);
  }
  return `<meshgradient id="${id}" gradientUnits="userSpaceOnUse" x="${origin.x}" y="${origin.y}" type="linear" data-savage-mesh="${payload}">${rows.join("")}</meshgradient>`;
}

export function parseSavageMeshAttr(el: Element): MeshGradientPaint | null {
  const raw = el.getAttribute("data-savage-mesh");
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as {
      columns?: number;
      rows?: number;
      points?: MeshGradientPaint["points"];
    };
    if (!data.points?.length || !data.columns || !data.rows) return null;
    return {
      type: "mesh",
      columns: data.columns,
      rows: data.rows,
      points: data.points,
    };
  } catch {
    return null;
  }
}

function pathEnd(
  start: { x: number; y: number },
  d: string,
): { x: number; y: number } {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let i = 0;
  let x = start.x;
  let y = start.y;
  let cmd = "";
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
    }
    if (!cmd) break;
    switch (cmd) {
      case "M":
        x = num();
        y = num();
        break;
      case "m":
        x += num();
        y += num();
        break;
      case "L":
        x = num();
        y = num();
        break;
      case "l":
        x += num();
        y += num();
        break;
      case "C":
        num();
        num();
        num();
        num();
        x = num();
        y = num();
        break;
      case "c":
        num();
        num();
        num();
        num();
        x += num();
        y += num();
        break;
      default:
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i])) i++;
        cmd = "";
    }
  }
  return { x, y };
}

function stopColor(el: Element): { color: string; opacity: number } {
  const color = el.getAttribute("stop-color") || "#000000";
  const opacity = Number(el.getAttribute("stop-opacity") ?? "1");
  return { color, opacity: Number.isFinite(opacity) ? opacity : 1 };
}

/** Reconstruct a bilinear mesh from meshrow/meshpatch stops when JSON payload is absent. */
export function parseMeshGradientElement(el: Element): MeshGradientPaint | null {
  const fromAttr = parseSavageMeshAttr(el);
  if (fromAttr) return fromAttr;

  const meshRows = Array.from(el.children).filter(
    (c) => c.tagName.toLowerCase() === "meshrow",
  );
  if (!meshRows.length) return null;

  const patches = meshRows.map((row) =>
    Array.from(row.children).filter((c) => c.tagName.toLowerCase() === "meshpatch"),
  );
  const rows = patches.length;
  const columns = Math.max(...patches.map((p) => p.length), 0);
  if (rows < 1 || columns < 1) return null;

  const points: MeshGradientPaint["points"] = Array.from(
    { length: (rows + 1) * (columns + 1) },
    () => ({ x: 0, y: 0, color: "#000000", opacity: 1 }),
  );

  let start = {
    x: Number(el.getAttribute("x") ?? 0) || 0,
    y: Number(el.getAttribute("y") ?? 0) || 0,
  };
  const firstRowStarts: { x: number; y: number }[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < patches[row].length; col++) {
      const stops = Array.from(patches[row][col].children).filter(
        (c) => c.tagName.toLowerCase() === "stop",
      );
      if (stops.length < 4) continue;
      if (col === 0) {
        start = row === 0 ? start : (firstRowStarts[row] ?? start);
      }
      const corners: { x: number; y: number; color: string; opacity: number }[] = [];
      let cursor = start;
      for (let s = 0; s < 4; s++) {
        const { color, opacity } = stopColor(stops[s]);
        corners.push({ ...cursor, color, opacity });
        cursor = pathEnd(cursor, stops[s].getAttribute("path") || "");
      }
      const [p00, p10, p11, p01] = corners;
      points[meshIndex(columns, col, row)] = p00;
      points[meshIndex(columns, col + 1, row)] = p10;
      points[meshIndex(columns, col + 1, row + 1)] = p11;
      points[meshIndex(columns, col, row + 1)] = p01;
      if (col === 0) firstRowStarts[row + 1] = p01;
      start = p10;
    }
  }

  return { type: "mesh", columns, rows, points };
}
