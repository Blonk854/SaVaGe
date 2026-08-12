export interface MeshPoint {
  x: number;
  y: number;
  color: string;
  opacity: number;
}

export interface MeshGrid {
  columns: number;
  rows: number;
  points: MeshPoint[];
}

export function meshIndex(columns: number, col: number, row: number): number {
  return row * (columns + 1) + col;
}

export function parseHexColor(color: string): { r: number; g: number; b: number } {
  let hex = color;
  if (hex.startsWith("#") && hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (!hex.startsWith("#") || hex.length < 7) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Bilinear sample of mesh vertex colors in cell (col,row) at local u,v in [0,1]. */
export function sampleMeshCell(
  mesh: MeshGrid,
  col: number,
  row: number,
  u: number,
  v: number,
): { r: number; g: number; b: number; a: number } {
  const c00 = mesh.points[meshIndex(mesh.columns, col, row)];
  const c10 = mesh.points[meshIndex(mesh.columns, col + 1, row)];
  const c01 = mesh.points[meshIndex(mesh.columns, col, row + 1)];
  const c11 = mesh.points[meshIndex(mesh.columns, col + 1, row + 1)];
  const p00 = parseHexColor(c00.color);
  const p10 = parseHexColor(c10.color);
  const p01 = parseHexColor(c01.color);
  const p11 = parseHexColor(c11.color);
  const top = {
    r: lerp(p00.r, p10.r, u),
    g: lerp(p00.g, p10.g, u),
    b: lerp(p00.b, p10.b, u),
    a: lerp(c00.opacity, c10.opacity, u),
  };
  const bot = {
    r: lerp(p01.r, p11.r, u),
    g: lerp(p01.g, p11.g, u),
    b: lerp(p01.b, p11.b, u),
    a: lerp(c01.opacity, c11.opacity, u),
  };
  return {
    r: lerp(top.r, bot.r, v),
    g: lerp(top.g, bot.g, v),
    b: lerp(top.b, bot.b, v),
    a: lerp(top.a, bot.a, v),
  };
}

/** Rasterize mesh into RGBA buffer (row-major). Returns null if empty. */
export function rasterizeMesh(
  mesh: MeshGrid,
  width: number,
  height: number,
  originX: number,
  originY: number,
): Uint8ClampedArray | null {
  if (width < 1 || height < 1 || !mesh.points.length) return null;
  const data = new Uint8ClampedArray(width * height * 4);
  const cols = mesh.columns;
  const rows = mesh.rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const p00 = mesh.points[meshIndex(cols, col, row)];
      const p10 = mesh.points[meshIndex(cols, col + 1, row)];
      const p01 = mesh.points[meshIndex(cols, col, row + 1)];
      const p11 = mesh.points[meshIndex(cols, col + 1, row + 1)];
      const minX = Math.max(0, Math.floor(Math.min(p00.x, p10.x, p01.x, p11.x) - originX));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(p00.x, p10.x, p01.x, p11.x) - originX));
      const minY = Math.max(0, Math.floor(Math.min(p00.y, p10.y, p01.y, p11.y) - originY));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(p00.y, p10.y, p01.y, p11.y) - originY));

      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const wx = px + originX + 0.5;
          const wy = py + originY + 0.5;
          // Inverse bilinear approx via normalized cell coords
          const x0 = lerp(p00.x, p01.x, 0.5);
          const x1 = lerp(p10.x, p11.x, 0.5);
          const y0 = lerp(p00.y, p10.y, 0.5);
          const y1 = lerp(p01.y, p11.y, 0.5);
          const u = (wx - Math.min(p00.x, p01.x)) / Math.max(1e-6, Math.max(p10.x, p11.x) - Math.min(p00.x, p01.x));
          const v = (wy - Math.min(p00.y, p10.y)) / Math.max(1e-6, Math.max(p01.y, p11.y) - Math.min(p00.y, p10.y));
          if (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05) continue;
          void x0;
          void x1;
          void y0;
          void y1;
          const c = sampleMeshCell(mesh, col, row, Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)));
          const i = (py * width + px) * 4;
          data[i] = Math.round(c.r);
          data[i + 1] = Math.round(c.g);
          data[i + 2] = Math.round(c.b);
          data[i + 3] = Math.round(c.a * 255);
        }
      }
    }
  }
  return data;
}

export function defaultMeshGradient(width = 120, height = 120): MeshGrid {
  const columns = 2;
  const rows = 2;
  const colors = [
    ["#B8FF3C", "#22D3EE", "#A78BFA"],
    ["#F472B6", "#FBBF24", "#34D399"],
    ["#60A5FA", "#FB7185", "#E2E8F0"],
  ];
  const points: MeshPoint[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= columns; c++) {
      points.push({
        x: (c / columns) * width,
        y: (r / rows) * height,
        color: colors[r][c],
        opacity: 1,
      });
    }
  }
  return { columns, rows, points };
}
