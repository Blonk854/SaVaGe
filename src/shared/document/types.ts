export type NodeId = string;

export type BlendMode = "normal" | "multiply" | "screen" | "overlay";

export interface Transform2D {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
}

export interface SolidPaint {
  type: "solid";
  color: string;
  opacity: number;
}

export interface GradientStop {
  offset: number;
  color: string;
  opacity: number;
}

export interface LinearGradientPaint {
  type: "linear";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: GradientStop[];
}

export interface RadialGradientPaint {
  type: "radial";
  cx: number;
  cy: number;
  r: number;
  fx?: number;
  fy?: number;
  stops: GradientStop[];
}

/** Grid mesh gradient (Coons-style bilinear cells). Exported as SVG 2 `<meshgradient>`. */
export interface MeshGradientPaint {
  type: "mesh";
  columns: number;
  rows: number;
  points: {
    x: number;
    y: number;
    color: string;
    opacity: number;
  }[];
}

export type Paint =
  | SolidPaint
  | LinearGradientPaint
  | RadialGradientPaint
  | MeshGradientPaint
  | { type: "none" };

export interface DropShadowEffect {
  enabled: boolean;
  x: number;
  y: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface NodeEffects {
  blur: number;
  shadow: DropShadowEffect;
}

export interface StrokeStyle {
  paint: Paint;
  width: number;
  lineCap: "butt" | "round" | "square";
  lineJoin: "miter" | "round" | "bevel";
  miterLimit: number;
  dashArray: number[];
  dashOffset: number;
  align: "center" | "inside" | "outside";
}

export interface PathPoint {
  id: NodeId;
  x: number;
  y: number;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
  type: "corner" | "smooth" | "symmetric";
  /** Optional local stroke width for variable-width strokes (falls back to StrokeStyle.width). */
  strokeWidth?: number;
}

export interface PathSubpath {
  closed: boolean;
  points: PathPoint[];
}

export type SceneNode =
  | GroupNode
  | PathNode
  | RectNode
  | EllipseNode
  | LineNode
  | TextNode
  | ImageNode
  | SymbolInstanceNode;

/** Master artwork for reusable symbols (stored outside the main scene graph). */
export interface SymbolDefinition {
  id: NodeId;
  name: string;
  width: number;
  height: number;
  rootChildIds: NodeId[];
  nodes: Record<NodeId, SceneNode>;
}

export interface NodeBase {
  id: NodeId;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  transform: Transform2D;
  effects?: NodeEffects;
  /** Id of a path/shape node used as this node's clip mask */
  clipPathId?: NodeId | null;
}

export interface Artboard {
  id: NodeId;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  background: string | null;
}

export interface GroupNode extends NodeBase {
  type: "group";
  children: NodeId[];
}

export interface PathNode extends NodeBase {
  type: "path";
  subpaths: PathSubpath[];
  fill: Paint;
  stroke: StrokeStyle;
  fillRule: "nonzero" | "evenodd";
}

export interface RectNode extends NodeBase {
  type: "rect";
  width: number;
  height: number;
  rx: number;
  ry: number;
  fill: Paint;
  stroke: StrokeStyle;
}

export interface EllipseNode extends NodeBase {
  type: "ellipse";
  rx: number;
  ry: number;
  fill: Paint;
  stroke: StrokeStyle;
}

export interface LineNode extends NodeBase {
  type: "line";
  x2: number;
  y2: number;
  stroke: StrokeStyle;
}

export interface TextNode extends NodeBase {
  type: "text";
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  lineHeight: number;
  fill: Paint;
  stroke: StrokeStyle;
}

export interface ImageNode extends NodeBase {
  type: "image";
  href: string;
  width: number;
  height: number;
}

export interface SymbolInstanceNode extends NodeBase {
  type: "symbolInstance";
  symbolId: NodeId;
  width: number;
  height: number;
}

export interface SvgDocument {
  version: 1;
  name: string;
  width: number;
  height: number;
  viewBox: { x: number; y: number; w: number; h: number };
  background: string | null;
  rootChildIds: NodeId[];
  nodes: Record<NodeId, SceneNode>;
  assets: Record<string, { mime: string; dataBase64: string }>;
  artboards: Artboard[];
  activeArtboardId: NodeId;
  symbols: Record<NodeId, SymbolDefinition>;
}

export function defaultTransform(x = 0, y = 0): Transform2D {
  return { x, y, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 };
}

export function defaultStroke(color = "#000000", width = 1): StrokeStyle {
  return {
    paint: { type: "solid", color, opacity: 1 },
    width,
    lineCap: "butt",
    lineJoin: "miter",
    miterLimit: 4,
    dashArray: [],
    dashOffset: 0,
    align: "center",
  };
}

export function solidFill(color: string, opacity = 1): SolidPaint {
  return { type: "solid", color, opacity };
}

export function defaultLinearGradient(): LinearGradientPaint {
  return {
    type: "linear",
    x1: 0,
    y1: 0,
    x2: 100,
    y2: 0,
    stops: [
      { offset: 0, color: "#B8FF3C", opacity: 1 },
      { offset: 1, color: "#22D3EE", opacity: 1 },
    ],
  };
}

export function defaultRadialGradient(): RadialGradientPaint {
  return {
    type: "radial",
    cx: 50,
    cy: 50,
    r: 50,
    stops: [
      { offset: 0, color: "#B8FF3C", opacity: 1 },
      { offset: 1, color: "#0B0D10", opacity: 1 },
    ],
  };
}

export function defaultMeshGradient(width = 120, height = 120): MeshGradientPaint {
  const columns = 2;
  const rows = 2;
  const palette = [
    ["#B8FF3C", "#22D3EE", "#A78BFA"],
    ["#F472B6", "#FBBF24", "#34D399"],
    ["#60A5FA", "#FB7185", "#E2E8F0"],
  ];
  const points: MeshGradientPaint["points"] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= columns; c++) {
      points.push({
        x: (c / columns) * width,
        y: (r / rows) * height,
        color: palette[r][c],
        opacity: 1,
      });
    }
  }
  return { type: "mesh", columns, rows, points };
}

export function defaultEffects(): NodeEffects {
  return {
    blur: 0,
    shadow: {
      enabled: false,
      x: 4,
      y: 4,
      blur: 8,
      color: "#000000",
      opacity: 0.35,
    },
  };
}

export function ensureEffects(node: SceneNode): NodeEffects {
  return node.effects ?? defaultEffects();
}
