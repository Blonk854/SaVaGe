import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { SaveConflictDialog } from "./SaveConflictDialog";
import {
  getSaveConflictPrompt,
  promptSaveConflict,
  resolveSaveConflictPrompt,
} from "./saveConflictPrompt";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("in-app save conflict prompt", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (getSaveConflictPrompt()) resolveSaveConflictPrompt("cancel");
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
  });

  function mountDialog() {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(<SaveConflictDialog />);
    });
  }

  function clickAction(action: "reload" | "saveAs" | "overwrite" | "cancel") {
    const button = host?.querySelector(`[data-action="${action}"]`);
    expect(button, `${action} button`).toBeTruthy();
    act(() => {
      (button as HTMLButtonElement).click();
    });
  }

  it("resolves Reload, Save As, Overwrite, and Cancel from in-app buttons", async () => {
    mountDialog();
    const decisions: Array<Promise<string>> = [];
    act(() => {
      decisions.push(promptSaveConflict());
    });
    clickAction("reload");
    await expect(decisions[0]).resolves.toBe("reload");

    act(() => {
      decisions.push(promptSaveConflict());
    });
    clickAction("saveAs");
    await expect(decisions[1]).resolves.toBe("saveAs");

    act(() => {
      decisions.push(promptSaveConflict());
    });
    clickAction("overwrite");
    await expect(decisions[2]).resolves.toBe("overwrite");

    act(() => {
      decisions.push(promptSaveConflict());
    });
    clickAction("cancel");
    await expect(decisions[3]).resolves.toBe("cancel");
  });
});
