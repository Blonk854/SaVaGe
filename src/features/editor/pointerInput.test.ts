import { describe, expect, it } from "vitest";
import { pointerMoveNeedsToolUpdate } from "./pointerInput";

describe("pointerMoveNeedsToolUpdate", () => {
  it("ignores idle hover so snapping and tools stay off the pointer path", () => {
    expect(pointerMoveNeedsToolUpdate(0, false)).toBe(false);
  });

  it("updates while panning or dragging", () => {
    expect(pointerMoveNeedsToolUpdate(0, true)).toBe(true);
    expect(pointerMoveNeedsToolUpdate(1, false)).toBe(true);
  });
});
