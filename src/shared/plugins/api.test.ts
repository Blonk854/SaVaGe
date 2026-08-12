import { beforeEach, describe, expect, it } from "vitest";
import {
  listPlugins,
  registerBuiltinPlugins,
  registerPlugin,
  runPluginCommand,
  unregisterPlugin,
  createPluginApi,
} from "./api";

describe("plugins api", () => {
  beforeEach(() => {
    for (const p of listPlugins()) unregisterPlugin(p.id);
  });

  it("registers builtin plugins", () => {
    registerBuiltinPlugins();
    const ids = listPlugins().map((p) => p.id);
    expect(ids).toContain("savage.duplicate-offset");
    expect(ids).toContain("savage.randomize-fills");
    expect(ids).toContain("savage.add-guide-rect");
  });

  it("runs a custom plugin command", async () => {
    let ran = false;
    registerPlugin({
      id: "test.ping",
      name: "Ping",
      commands: [
        {
          id: "go",
          label: "Go",
          run: () => {
            ran = true;
          },
        },
      ],
    });
    await runPluginCommand("test.ping", "go");
    expect(ran).toBe(true);
  });

  it("exposes a document api surface", () => {
    const api = createPluginApi();
    expect(typeof api.exportSvg).toBe("function");
    expect(typeof api.addNode).toBe("function");
    expect(Array.isArray(api.getSelectionIds())).toBe(true);
  });
});
