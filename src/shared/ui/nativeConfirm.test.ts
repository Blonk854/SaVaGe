import { describe, expect, it } from "vitest";
import {
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

  it("accepts Yes/Ok as the labeled affirmative button", () => {
    expect(isAffirmativeDialogResult("Discard", "Discard")).toBe(true);
    expect(isAffirmativeDialogResult("Yes", "Discard")).toBe(true);
    expect(isAffirmativeDialogResult("Ok", "Discard")).toBe(true);
    expect(isAffirmativeDialogResult("Cancel", "Discard")).toBe(false);
    expect(isAffirmativeDialogResult("No", "Discard")).toBe(false);
  });
});
