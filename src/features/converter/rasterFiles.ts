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

export function isRasterPath(path: string): boolean {
  const lower = path.toLowerCase().split(/[?#]/)[0];
  return RASTER_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

export function firstRasterPath(paths: string[]): string | null {
  return paths.find(isRasterPath) ?? null;
}
