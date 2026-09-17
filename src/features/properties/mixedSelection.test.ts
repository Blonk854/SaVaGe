import { describe, expect, it } from "vitest";
import { mixedSelectionSummary } from "./mixedSelection";

describe("mixedSelectionSummary", () => {
  it("describes a homogeneous multi-selection", () => {
    expect(
      mixedSelectionSummary([
        { name: "A", type: "rect" },
        { name: "B", type: "rect" },
      ]),
    ).toEqual({
      title: "2 objects selected",
      detail: "These are rectangles. Select one object to edit size, fill, and effects.",
    });
  });

  it("describes mixed types without editing the first object", () => {
    expect(
      mixedSelectionSummary([
        { name: "A", type: "rect" },
        { name: "Title", type: "text" },
      ]),
    ).toEqual({
      title: "2 objects selected",
      detail:
        "Mixed types (rectangles, text objects). Select one object to edit size, fill, and effects.",
    });
  });
});
