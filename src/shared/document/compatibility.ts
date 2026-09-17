import { PROJECT_SCHEMA_VERSION } from "./parseSavage";

export { PROJECT_SCHEMA_VERSION };

export const RECOVERY_FORMAT_VERSION = 1 as const;

export type CompatibilitySupport = "lossless" | "bounded" | "unsupported";

export interface FormatCompatibilityRow {
  format: string;
  reader: CompatibilitySupport;
  writer: CompatibilitySupport;
  notes: string;
}

export const PROJECT_READER_WRITER: FormatCompatibilityRow[] = [
  {
    format: ".savage schema 1",
    reader: "lossless",
    writer: "lossless",
    notes: "Current native project. Open copies; Save writes schema 1 only.",
  },
  {
    format: ".savage schema ≥2",
    reader: "unsupported",
    writer: "unsupported",
    notes: "Rejected in memory with an actionable message. The source file is not rewritten.",
  },
  {
    format: "recovery envelope 1 + schema 1",
    reader: "lossless",
    writer: "lossless",
    notes: "Recover opens as Unsaved. Open Original does not apply recovered edits.",
  },
  {
    format: "recovery envelope ≥2 or schema ≥2",
    reader: "unsupported",
    writer: "unsupported",
    notes: "Left in place. Not quarantined, migrated, or overwritten by this reader.",
  },
];

export const SVG_SUPPORT: FormatCompatibilityRow[] = [
  {
    format: "paths M/L/H/V/C/S/Q/T/Z",
    reader: "lossless",
    writer: "lossless",
    notes: "Native path subset.",
  },
  {
    format: "elliptical arcs A",
    reader: "bounded",
    writer: "unsupported",
    notes: "Import approximates arcs as line segments. Export does not emit A.",
  },
  {
    format: "translate/rotate/scale",
    reader: "bounded",
    writer: "lossless",
    notes: "Import reads a single translate/rotate/scale from the transform attribute.",
  },
  {
    format: "skew / full transform lists / matrix()",
    reader: "unsupported",
    writer: "lossless",
    notes: "Native projects store skew. SVG import does not parse skew or matrix lists.",
  },
  {
    format: "solid / linear / radial / mesh paint",
    reader: "lossless",
    writer: "lossless",
    notes: "Mesh is SVG 2; some browsers skip it. Prefer PNG for mesh-critical stills.",
  },
  {
    format: "text",
    reader: "bounded",
    writer: "bounded",
    notes: "Single-run text. Outlines use bundled DM Sans / Syne.",
  },
  {
    format: "clip paths used as clip masks",
    reader: "unsupported",
    writer: "lossless",
    notes: "Native clips export. SVG clipPath/symbol/use are not imported as scene objects.",
  },
  {
    format: "embedded raster <image>",
    reader: "unsupported",
    writer: "lossless",
    notes: "Import drops image elements. Convert rasters instead.",
  },
  {
    format: "script, foreignObject, animation, remote fetch",
    reader: "unsupported",
    writer: "unsupported",
    notes: "Rejected at ingest. Not serialized back out.",
  },
];

export const UNSUPPORTED_SVG_TAGS = [
  "script",
  "foreignobject",
  "animate",
  "use",
  "image",
] as const;
