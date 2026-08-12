import type { SvgDocument } from "../../../shared/document/types";
import { selectionBounds } from "../../../shared/geometry/bounds";
import { worldToScreen } from "../../../shared/geometry/transform";
import { subpathsToPath2D } from "../../../shared/geometry/path";
import { transformToMatrix } from "../../../shared/geometry/transform";

export interface HandlePoint {
  id: string;
  x: number;
  y: number;
}

export function drawSelectionChrome(
  ctx: CanvasRenderingContext2D,
  doc: SvgDocument,
  selection: string[],
  zoom: number,
  panX: number,
  panY: number,
  showAnchors: boolean,
): HandlePoint[] {
  const handles: HandlePoint[] = [];
  if (!selection.length) return handles;
  const b = selectionBounds(doc, selection);
  if (b.w <= 0 && b.h <= 0) return handles;

  const tl = worldToScreen(b.x, b.y, zoom, panX, panY);
  const br = worldToScreen(b.x + b.w, b.y + b.h, zoom, panX, panY);
  const x = tl.x;
  const y = tl.y;
  const w = br.x - tl.x;
  const h = br.y - tl.y;

  ctx.save();
  ctx.strokeStyle = "#B8FF3C";
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(x, y, w, h);

  const pts = [
    { id: "nw", x, y },
    { id: "n", x: x + w / 2, y },
    { id: "ne", x: x + w, y },
    { id: "e", x: x + w, y: y + h / 2 },
    { id: "se", x: x + w, y: y + h },
    { id: "s", x: x + w / 2, y: y + h },
    { id: "sw", x, y: y + h },
    { id: "w", x, y: y + h / 2 },
    { id: "rot", x: x + w / 2, y: y - 24 },
  ];
  for (const p of pts) {
    handles.push(p);
    ctx.fillStyle = p.id === "rot" ? "#B8FF3C" : "#0B0D10";
    ctx.strokeStyle = "#B8FF3C";
    ctx.beginPath();
    if (p.id === "rot") {
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else {
      ctx.rect(p.x - 4, p.y - 4, 8, 8);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (showAnchors && selection.length === 1) {
    const node = doc.nodes[selection[0]];
    if (node?.type === "path") {
      const m = transformToMatrix(node.transform);
      ctx.fillStyle = "#22D3EE";
      for (const sp of node.subpaths) {
        for (const pt of sp.points) {
          const wx = m.a * pt.x + m.c * pt.y + m.e;
          const wy = m.b * pt.x + m.d * pt.y + m.f;
          const s = worldToScreen(wx, wy, zoom, panX, panY);
          ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
          handles.push({ id: `anchor:${pt.id}`, x: s.x, y: s.y });
        }
      }
      void subpathsToPath2D;
    }
  }

  ctx.restore();
  return handles;
}
