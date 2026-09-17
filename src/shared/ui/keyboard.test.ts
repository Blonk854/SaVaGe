import { describe, expect, it } from "vitest";
import {
  adjacentIndex,
  focusListSibling,
  isTypingTarget,
  shouldIgnoreCanvasShortcut,
} from "./keyboard";

describe("keyboard helpers", () => {
  it("treats form controls as typing targets", () => {
    const input = document.createElement("input");
    const select = document.createElement("select");
    const button = document.createElement("button");
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(select)).toBe(true);
    expect(isTypingTarget(button)).toBe(false);
  });

  it("blocks canvas shortcuts while typing or using menus and list arrows", () => {
    const input = document.createElement("input");
    expect(shouldIgnoreCanvasShortcut(input, "v")).toBe(true);

    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const item = document.createElement("button");
    menu.append(item);
    document.body.append(menu);
    expect(shouldIgnoreCanvasShortcut(item, "v")).toBe(true);
    menu.remove();

    const row = document.createElement("div");
    row.dataset.listRow = "";
    document.body.append(row);
    expect(shouldIgnoreCanvasShortcut(row, "ArrowDown")).toBe(true);
    expect(shouldIgnoreCanvasShortcut(row, "F2")).toBe(true);
    expect(shouldIgnoreCanvasShortcut(row, "v")).toBe(false);
    row.remove();
  });

  it("wraps adjacent menu indexes and moves list row focus", () => {
    expect(adjacentIndex(0, -1, 5)).toBe(4);
    expect(adjacentIndex(4, 1, 5)).toBe(0);

    const root = document.createElement("div");
    root.dataset.listRoot = "";
    const a = document.createElement("button");
    const b = document.createElement("button");
    a.dataset.listRow = "";
    b.dataset.listRow = "";
    root.append(a, b);
    document.body.append(root);
    expect(focusListSibling(a, 1)).toBe(b);
    expect(document.activeElement).toBe(b);
    expect(focusListSibling(b, 1)).toBeNull();
    root.remove();
  });
});
