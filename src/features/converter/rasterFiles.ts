export const RASTER_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
] as const;

const RASTER_LIST = "PNG, JPEG, GIF, WEBP, BMP, or TIFF";

export interface GrantedImageSource {
  path: string;
  grantId: string;
}

export interface ImagePreview {
  dataUrl: string;
  width: number;
  height: number;
  byteSize: number;
  format: string;
}

export type DropInspect =
  | { kind: "raster"; path: string }
  | { kind: "rejected"; message: string };

export function parseGrantedImageSource(value: unknown): GrantedImageSource {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as { path?: unknown }).path !== "string" ||
    typeof (value as { grantId?: unknown }).grantId !== "string"
  ) {
    throw new Error("Native image selection returned invalid authorization");
  }
  return value as GrantedImageSource;
}

export function parseImagePreview(value: unknown): ImagePreview {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as { dataUrl?: unknown }).dataUrl !== "string" ||
    typeof (value as { width?: unknown }).width !== "number" ||
    typeof (value as { height?: unknown }).height !== "number" ||
    typeof (value as { byteSize?: unknown }).byteSize !== "number" ||
    typeof (value as { format?: unknown }).format !== "string"
  ) {
    throw new Error("Native image preview returned invalid metadata");
  }
  const preview = value as ImagePreview;
  if (
    !preview.dataUrl.startsWith("data:image/") ||
    !Number.isFinite(preview.width) ||
    !Number.isFinite(preview.height) ||
    !Number.isFinite(preview.byteSize) ||
    preview.width <= 0 ||
    preview.height <= 0 ||
    preview.byteSize < 0
  ) {
    throw new Error("Native image preview returned invalid metadata");
  }
  return preview;
}

export function displayName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

export function isRasterPath(path: string): boolean {
  const lower = path.toLowerCase().split(/[?#]/)[0];
  return RASTER_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

export function firstRasterPath(paths: string[]): string | null {
  return paths.find(isRasterPath) ?? null;
}

function extensionOf(path: string): string | null {
  const base = displayName(path).toLowerCase().split(/[?#]/)[0];
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1);
}

export function inspectDroppedPaths(paths: string[]): DropInspect {
  if (paths.length === 0) {
    return { kind: "rejected", message: `Nothing was dropped. Drop ${RASTER_LIST}.` };
  }
  const raster = firstRasterPath(paths);
  if (raster) return { kind: "raster", path: raster };

  if (paths.length === 1) {
    const name = displayName(paths[0]);
    const ext = extensionOf(paths[0]);
    if (ext) {
      return {
        kind: "rejected",
        message: `${name} is a .${ext} file. Drop ${RASTER_LIST}.`,
      };
    }
    return {
      kind: "rejected",
      message: `${name} is not a supported raster image. Drop ${RASTER_LIST}.`,
    };
  }

  const shown = paths.slice(0, 3).map(displayName).join(", ");
  const extra = paths.length > 3 ? ` and ${paths.length - 3} more` : "";
  return {
    kind: "rejected",
    message: `Dropped ${shown}${extra}, but none are supported raster images. Use ${RASTER_LIST}.`,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function formatSourceMetadata(
  fileName: string,
  preview: Pick<ImagePreview, "format" | "width" | "height" | "byteSize">,
): string {
  return `${fileName} · ${preview.format.toUpperCase()} · ${preview.width}×${preview.height} · ${formatBytes(preview.byteSize)}`;
}
