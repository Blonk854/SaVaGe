import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { describe, it } from "vitest";

describe("editor module startup", () => {
  it("times a cold import of the editor path", async () => {
    const started = performance.now();
    await import("../document/parseSavage");
    await import("../document/serialize");
    await import("../geometry/hitTest");
    await import("../../features/editor/renderer/drawDocument");
    await import("../../features/editor/camera");
    const editorModuleEvalMs = performance.now() - started;
    const path = resolve(__dirname, "../../../benchmark-results/startup.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify({ editorModuleEvalMs, at: new Date().toISOString() })}\n`,
    );
  });
});
