import type { SvgDocument } from "../document/types";
import type { Bounds } from "./bounds";
import type { Mat2D } from "./transform";

/** Keep current + a handful of undo snapshots. History beyond this recomputes. */
export const DEFAULT_MAX_CACHED_DOCUMENTS = 16;
/** Skip bulk fill above this; on-demand entries evict LRU within the document. */
export const DEFAULT_MAX_CACHED_NODES = 8192;

interface DocDerived {
  matrices: Map<string, Mat2D>;
  bounds: Map<string, Bounds>;
  bulkFilled: boolean;
}

let maxDocuments = DEFAULT_MAX_CACHED_DOCUMENTS;
let maxNodesPerDocument = DEFAULT_MAX_CACHED_NODES;
const documents = new Map<SvgDocument, DocDerived>();

let matrixHits = 0;
let matrixMisses = 0;
let boundsHits = 0;
let boundsMisses = 0;

export interface DerivedCacheStats {
  documents: number;
  matrixEntries: number;
  boundsEntries: number;
  matrixHits: number;
  matrixMisses: number;
  boundsHits: number;
  boundsMisses: number;
}

export function derivedCacheStats(): DerivedCacheStats {
  let matrixEntries = 0;
  let boundsEntries = 0;
  for (const entry of documents.values()) {
    matrixEntries += entry.matrices.size;
    boundsEntries += entry.bounds.size;
  }
  return {
    documents: documents.size,
    matrixEntries,
    boundsEntries,
    matrixHits,
    matrixMisses,
    boundsHits,
    boundsMisses,
  };
}

export function derivedCacheLimits(): { maxDocuments: number; maxNodesPerDocument: number } {
  return { maxDocuments, maxNodesPerDocument };
}

export function setDerivedCacheLimits(limits: {
  maxDocuments?: number;
  maxNodesPerDocument?: number;
}): void {
  if (limits.maxDocuments !== undefined) {
    maxDocuments = Math.max(1, Math.floor(limits.maxDocuments));
  }
  if (limits.maxNodesPerDocument !== undefined) {
    maxNodesPerDocument = Math.max(1, Math.floor(limits.maxNodesPerDocument));
  }
  evictDocuments();
  for (const entry of documents.values()) {
    evictNodes(entry);
  }
}

export function resetDerivedCache(): void {
  documents.clear();
  maxDocuments = DEFAULT_MAX_CACHED_DOCUMENTS;
  maxNodesPerDocument = DEFAULT_MAX_CACHED_NODES;
  matrixHits = 0;
  matrixMisses = 0;
  boundsHits = 0;
  boundsMisses = 0;
}

/** Drop cached matrices/bounds for one snapshot, or every snapshot if omitted. */
export function invalidateDerivedCache(doc?: SvgDocument): void {
  if (!doc) {
    documents.clear();
    return;
  }
  documents.delete(doc);
}

export function maxCachedNodesPerDocument(): number {
  return maxNodesPerDocument;
}

export function recallMatrix(doc: SvgDocument, id: string): Mat2D | undefined {
  const entry = documents.get(doc);
  if (!entry) {
    matrixMisses += 1;
    return undefined;
  }
  touchDocument(doc, entry);
  const hit = entry.matrices.get(id);
  if (hit === undefined) {
    matrixMisses += 1;
    return undefined;
  }
  matrixHits += 1;
  touchNode(entry.matrices, id, hit);
  return hit;
}

export function rememberMatrix(doc: SvgDocument, id: string, matrix: Mat2D): void {
  const entry = touchDocument(doc);
  rememberNode(entry.matrices, id, matrix);
}

export function recallBounds(doc: SvgDocument, id: string): Bounds | undefined {
  const entry = documents.get(doc);
  if (!entry) {
    boundsMisses += 1;
    return undefined;
  }
  touchDocument(doc, entry);
  const hit = entry.bounds.get(id);
  if (hit === undefined) {
    boundsMisses += 1;
    return undefined;
  }
  boundsHits += 1;
  touchNode(entry.bounds, id, hit);
  return hit;
}

export function rememberBounds(doc: SvgDocument, id: string, bounds: Bounds): void {
  const entry = touchDocument(doc);
  rememberNode(entry.bounds, id, bounds);
}

export function markDocumentBulkFilled(doc: SvgDocument): void {
  touchDocument(doc).bulkFilled = true;
}

export function isDocumentBulkFilled(doc: SvgDocument): boolean {
  return documents.get(doc)?.bulkFilled === true;
}

function touchDocument(doc: SvgDocument, existing?: DocDerived): DocDerived {
  const entry = existing ?? documents.get(doc) ?? { matrices: new Map(), bounds: new Map(), bulkFilled: false };
  documents.delete(doc);
  documents.set(doc, entry);
  evictDocuments();
  return entry;
}

function rememberNode<T>(map: Map<string, T>, id: string, value: T): void {
  if (map.has(id)) {
    map.delete(id);
    map.set(id, value);
    return;
  }
  map.set(id, value);
  while (map.size > maxNodesPerDocument) {
    const oldest = map.keys().next().value;
    if (oldest === undefined || oldest === id) break;
    map.delete(oldest);
  }
}

function touchNode<T>(map: Map<string, T>, id: string, value: T): void {
  map.delete(id);
  map.set(id, value);
}

function evictDocuments(): void {
  while (documents.size > maxDocuments) {
    const oldest = documents.keys().next().value;
    if (oldest === undefined) break;
    documents.delete(oldest);
  }
}

function evictNodes(entry: DocDerived): void {
  while (entry.matrices.size > maxNodesPerDocument) {
    const oldest = entry.matrices.keys().next().value;
    if (oldest === undefined) break;
    entry.matrices.delete(oldest);
  }
  while (entry.bounds.size > maxNodesPerDocument) {
    const oldest = entry.bounds.keys().next().value;
    if (oldest === undefined) break;
    entry.bounds.delete(oldest);
  }
}
