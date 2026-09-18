import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { handleWindowCloseRequest } from "./nativeConfirm";
import {
  getUnsavedChangesPrompt,
  promptSaveDiscardCancel,
  resolveUnsavedChangesPrompt,
} from "./unsavedChangesPrompt";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("in-app unsaved changes prompt", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (getUnsavedChangesPrompt()) resolveUnsavedChangesPrompt("cancel");
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
      root?.render(<UnsavedChangesDialog />);
    });
  }

  function clickAction(action: "save" | "discard" | "cancel") {
    const button = host?.querySelector(`[data-action="${action}"]`);
    expect(button, `${action} button`).toBeTruthy();
    act(() => {
      (button as HTMLButtonElement).click();
    });
  }

  it("resolves Discard from the in-app buttons, not a native dialog", async () => {
    mountDialog();
    let decision!: Promise<string>;
    act(() => {
      decision = promptSaveDiscardCancel();
    });
    clickAction("discard");
    await expect(decision).resolves.toBe("discard");
  });

  it("closes the window only after Discard, and Cancel leaves it open", async () => {
    mountDialog();
    const closed: string[] = [];
    let closing!: Promise<void>;
    act(() => {
      closing = handleWindowCloseRequest({
        preventDefault: () => closed.push("prevent"),
        confirm: async () => (await promptSaveDiscardCancel()) !== "cancel",
        destroy: async () => {
          closed.push("exit");
        },
      });
    });
    clickAction("discard");
    await closing;
    expect(closed).toEqual(["prevent", "exit"]);

    const cancelled: string[] = [];
    let staying!: Promise<void>;
    act(() => {
      staying = handleWindowCloseRequest({
        preventDefault: () => cancelled.push("prevent"),
        confirm: async () => (await promptSaveDiscardCancel()) !== "cancel",
        destroy: async () => {
          cancelled.push("exit");
        },
      });
    });
    clickAction("cancel");
    await staying;
    expect(cancelled).toEqual(["prevent"]);
  });
});
