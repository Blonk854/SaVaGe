import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "./emptyDocument";
import { parseSavageDocument } from "./parseSavage";

describe("parseSavageDocument", () => {
  it("loads a valid project", () => {
    const src = createEmptyDocument(400, 300, "Poster");
    const doc = parseSavageDocument(JSON.stringify(src));
    expect(doc.name).toBe("Poster");
    expect(doc.width).toBe(400);
    expect(doc.rootChildIds).toEqual([]);
  });

  it("rejects truncated JSON and non-documents", () => {
    expect(() => parseSavageDocument("{")).toThrow(/JSON/);
    expect(() => parseSavageDocument(JSON.stringify({ hello: true }))).toThrow(/Unrecognized/);
  });
});
