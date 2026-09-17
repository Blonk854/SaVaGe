import { describe, expect, it } from "vitest";
import {
  cancelConvertJob,
  convertImageToSvg,
  isCancelledConversion,
  matchingPreset,
  PRESETS,
} from "./convertApi";

describe("convertImageToSvg", () => {
  it("requires native results to echo the job, session, and source revision", async () => {
    await expect(
      convertImageToSvg(
        "grant_1",
        PRESETS.logo,
        "session_1",
        4,
        async (_command, args) => ({
          jobId: (args?.request as { jobId: string }).jobId,
          sessionId: "other_session",
          sourceRevision: 4,
          svg: "<svg />",
        }),
      ),
    ).rejects.toThrow("stale or invalid");
  });

  it("requires cancel to confirm the same job entered CancelRequested", async () => {
    await expect(
      cancelConvertJob("job_1", async () => ({ jobId: "other", state: "cancelRequested" })),
    ).rejects.toThrow("did not confirm");

    await expect(
      cancelConvertJob("job_1", async (command, args) => {
        expect(command).toBe("cancel_convert_job");
        expect(args).toEqual({ jobId: "job_1" });
        return { jobId: "job_1", state: "cancelRequested" };
      }),
    ).resolves.toEqual({ jobId: "job_1", state: "cancelRequested" });
  });

  it("marks options as Custom when they no longer match a named preset", () => {
    expect(matchingPreset(PRESETS.logo)).toBe("logo");
    expect(matchingPreset({ ...PRESETS.photo, color_precision: 8 })).toBe("custom");
    expect(matchingPreset({ ...PRESETS.line })).toBe("line");
  });

  it("detects native cancelled results without treating them as generic failures", () => {
    expect(isCancelledConversion({ code: "cancelled", message: "stopped" })).toBe(true);
    expect(isCancelledConversion(new Error("Conversion was cancelled before the trace stage completed"))).toBe(
      true,
    );
    expect(isCancelledConversion(new Error("source_not_authorized"))).toBe(false);
  });
});
