import { describe, expect, it } from "vitest";
import { APP_COMMANDS, filterCommands } from "./commands";
import { confirmAction, getConfirmAction, resolveConfirmAction } from "./confirmAction";
import { dismissWelcome, isWelcomeDismissed, reopenWelcome } from "./firstRun";

describe("command search", () => {
  it("matches every word across the label, shortcut, and keywords", () => {
    expect(filterCommands(APP_COMMANDS, "rectangle").map((command) => command.id)).toEqual(["rect-tool"]);
    expect(filterCommands(APP_COMMANDS, "fit artboard").map((command) => command.id)).toEqual([
      "fit-artboard",
    ]);
    expect(filterCommands(APP_COMMANDS, "missing-command")).toEqual([]);
  });
});

describe("welcome tips", () => {
  it("can be dismissed and reopened", () => {
    const storage = new MemoryStorage();
    expect(isWelcomeDismissed(storage)).toBe(false);
    dismissWelcome(storage);
    expect(isWelcomeDismissed(storage)).toBe(true);
    reopenWelcome(storage);
    expect(isWelcomeDismissed(storage)).toBe(false);
  });
});

describe("confirm action", () => {
  it("resolves one prompt and refuses a second until it closes", async () => {
    const first = confirmAction("Delete symbol", "Expand instances first.");
    expect(getConfirmAction()?.title).toBe("Delete symbol");
    await expect(confirmAction("Again", "no")).resolves.toBe(false);
    resolveConfirmAction(true);
    await expect(first).resolves.toBe(true);
    expect(getConfirmAction()).toBeNull();
  });
});

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
