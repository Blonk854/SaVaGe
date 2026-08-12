/** Ray-cast point-in-polygon. Contour is [[x,y], ...] in world space. */
export function pointInPolygon(
  x: number,
  y: number,
  contour: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const [xi, yi] = contour[i];
    const [xj, yj] = contour[j];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInContours(
  x: number,
  y: number,
  shapes: [number, number][][][], // ShapeContours[]
): boolean {
  // Even-odd across all contours in all shapes
  let hits = 0;
  for (const shape of shapes) {
    for (const contour of shape) {
      if (pointInPolygon(x, y, contour as [number, number][])) hits++;
    }
  }
  return hits % 2 === 1;
}
