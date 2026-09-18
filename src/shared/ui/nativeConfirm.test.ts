import { describe, expect, it } from "vitest";
import {
  handleWindowCloseRequest,
  isAffirmativeDialogResult,
  replacementDecisionFromDialog,
} from "./nativeConfirm";

describe("native dialog results", () => {
  it("treats Windows Yes/Ok as Save and No as Discard", () => {
    expect(replacementDecisionFromDialog("Save")).toBe("save");
    expect(replacementDecisionFromDialog("Yes")).toBe("save");
    expect(replacementDecisionFromDialog("Ok")).toBe("save");
    expect(replacementDecisionFromDialog("Discard")).toBe("discard");
    expect(replacementDecisionFromDialog("No")).toBe("discard");
    expect(replacementDecisionFromDialog("Cancel")).toBe("cancel");
    expect(replacementDecisionFromDialog("Other options")).toBe("cancel");
  });

  it("reads serde-tagged objects from the native dialog plugin", () => {
    expect(replacementDecisionFromDialog({ Yes: null })).toBe("save");
    expect(replacementDecisionFromDialog({ No: null })).toBe("discard");
    expect(replacementDecisionFromDialog({ Cancel: null })).toBe("cancel");
    expect(replacementDecisionFromDialog({ Ok: null })).toBe("save");
    expect(replacementDecisionFromDialog({ Custom: "Discard" })).toBe("discard");
  });

  it("accepts Yes/Ok as the labeled affirmative button", () => {
    expect(isAffirmativeDialogResult("Discard", "Discard")).toBe(true);
    expect(isAffirmativeDialogResult({ Yes: null }, "Discard")).toBe(true);
    expect(isAffirmativeDialogResult("Cancel", "Discard")).toBe(false);
    expect(isAffirmativeDialogResult({ No: null }, "Discard")).toBe(false);
  });

  it("always prevents the native close, then destroys only after confirm", async () => {
    const allowed: string[] = [];
    await handleWindowCloseRequest({
      preventDefault: () => allowed.push("prevent"),
      confirm: async () => true,
      destroy: async () => {
        allowed.push("destroy");
      },
    });
    expect(allowed).toEqual(["prevent", "destroy"]);

    const cancelled: string[] = [];
    await handleWindowCloseRequest({
      preventDefault: () => cancelled.push("prevent"),
      confirm: async () => false,
      destroy: async () => {
        cancelled.push("destroy");
      },
    });
    expect(cancelled).toEqual(["prevent"]);
  });
});
