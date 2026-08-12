import { nanoid } from "nanoid";
import {
  defaultStroke,
  defaultTransform,
  type PathNode,
  type TextNode,
} from "../../shared/document/types";
import { simplifyPolyline } from "../../shared/geometry/path";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";

/** Rasterize text and extract contours (marching-squares style edge walk). */
export function convertTextToOutlines(id: string) {
  const store = useDocumentStore.getState();
  const node = store.doc.nodes[id];
  if (!node || node.type !== "text") {
    throw new Error("Select a text object to convert to outlines");
  }
  const text = node as TextNode;
  const pad = 8;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.font = `${text.fontWeight} ${text.fontSize}px ${text.fontFamily}`;
  const metrics = ctx.measureText(text.content || " ");
  const w = Math.ceil(Math.max(metrics.width, 8) + pad * 2);
  const h = Math.ceil(text.fontSize * text.lineHeight + pad * 2);
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.font = `${text.fontWeight} ${text.fontSize}px ${text.fontFamily}`;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text.content, pad, pad + text.fontSize * 0.8);

  const img = ctx.getImageData(0, 0, w, h);
  const solid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    return img.data[(y * w + x) * 4 + 3] > 40;
  };

  // Collect boundary pixels then cluster into polylines via neighbor walk
  const visited = new Set<string>();
  const contours: { x: number; y: number }[][] = [];

  const key = (x: number, y: number) => `${x},${y}`;
  const isEdge = (x: number, y: number) => {
    if (!solid(x, y)) return false;
    return (
      !solid(x - 1, y) ||
      !solid(x + 1, y) ||
      !solid(x, y - 1) ||
      !solid(x, y + 1)
    );
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isEdge(x, y) || visited.has(key(x, y))) continue;
      const contour: { x: number; y: number }[] = [];
      let cx = x;
      let cy = y;
      let guard = 0;
      while (guard++ < w * h) {
        const k = key(cx, cy);
        if (visited.has(k)) break;
        visited.add(k);
        contour.push({ x: cx - pad, y: cy - pad - text.fontSize * 0.8 });
        const nbrs = [
          [cx + 1, cy],
          [cx, cy + 1],
          [cx - 1, cy],
          [cx, cy - 1],
          [cx + 1, cy + 1],
          [cx - 1, cy + 1],
          [cx + 1, cy - 1],
          [cx - 1, cy - 1],
        ];
        let next: number[] | null = null;
        for (const [nx, ny] of nbrs) {
          if (isEdge(nx, ny) && !visited.has(key(nx, ny))) {
            next = [nx, ny];
            break;
          }
        }
        if (!next) break;
        cx = next[0];
        cy = next[1];
      }
      if (contour.length >= 8) {
        contours.push(simplifyPolyline(contour, 1.25));
      }
    }
  }

  if (!contours.length) {
    throw new Error("Could not extract outlines from text");
  }

  const path: PathNode = {
    id: nanoid(10),
    name: `${text.name} outlines`,
    type: "path",
    visible: true,
    locked: false,
    opacity: text.opacity,
    blendMode: text.blendMode,
    transform: { ...text.transform },
    effects: text.effects,
    subpaths: contours.map((c) => ({
      closed: true,
      points: c.map((p) => ({
        id: nanoid(8),
        x: p.x,
        y: p.y,
        type: "corner" as const,
      })),
    })),
    fill: structuredClone(text.fill),
    stroke: text.stroke.width > 0 ? structuredClone(text.stroke) : defaultStroke("#000000", 0),
    fillRule: "evenodd",
  };
  if (path.stroke.width === 0) path.stroke.paint = { type: "none" };

  // Keep transform; path points are local relative to text origin
  path.transform = defaultTransform(text.transform.x, text.transform.y);
  path.transform.rotation = text.transform.rotation;
  path.transform.scaleX = text.transform.scaleX;
  path.transform.scaleY = text.transform.scaleY;

  store.deleteNodes([id]);
  store.addNode(path);
  useUiStore.getState().markDirty();
}
