import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type RectNode,
  type SceneNode,
} from "../document/types";
import { useDocumentStore } from "../stores/documentStore";
import { useProjectSessionStore } from "../stores/projectSessionStore";
import {
  listPlugins,
  registerBuiltinPlugins,
  registerPlugin,
  runPluginCommand,
  unregisterPlugin,
  createPluginApi,
} from "./api";

function rect(id: string, x = 0): RectNode {
  return {
    id,
    name: id,
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(x, 0),
    width: 10,
    height: 10,
    rx: 0,
    ry: 0,
    fill: solidFill("#ffffff"),
    stroke: defaultStroke("#000000", 1),
  };
}

function loadShape() {
  const doc = createEmptyDocument();
  doc.nodes.shape = rect("shape");
  doc.rootChildIds = ["shape"];
  useDocumentStore.getState().loadDocument(doc);
  useDocumentStore.getState().setSelection(["shape"]);
  useProjectSessionStore.getState().startSession({ displayName: "Plugin test" });
}

describe("plugins api", () => {
  beforeEach(() => {
    for (const plugin of listPlugins()) unregisterPlugin(plugin.id);
    loadShape();
  });

  it("registers builtin plugins", () => {
    registerBuiltinPlugins();
    const ids = listPlugins().map((plugin) => plugin.id);
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
    const api = createPluginApi({
      doc: structuredClone(useDocumentStore.getState().doc),
      selection: ["shape"],
    });
    expect(typeof api.exportSvg).toBe("function");
    expect(typeof api.addNode).toBe("function");
    expect(api.getSelectionIds()).toEqual(["shape"]);
  });

  it("does not let getNode mutate live document nodes", async () => {
    registerPlugin({
      id: "test.mutate-clone",
      name: "Mutate clone",
      commands: [
        {
          id: "go",
          label: "Go",
          run: (api) => {
            const node = api.getNode("shape");
            if (node) node.name = "hacked";
          },
        },
      ],
    });

    await runPluginCommand("test.mutate-clone", "go");
    expect(useDocumentStore.getState().doc.nodes.shape.name).toBe("shape");
    expect(useDocumentStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it("rolls back a thrown command without committing a history step", async () => {
    registerPlugin({
      id: "test.throw-after-add",
      name: "Throw after add",
      commands: [
        {
          id: "go",
          label: "Go",
          run: (api) => {
            api.addNode(rect("guide", 40));
            throw new Error("boom");
          },
        },
      ],
    });

    await expect(runPluginCommand("test.throw-after-add", "go")).rejects.toThrow(
      /Throw after add.*boom/,
    );
    expect(useDocumentStore.getState().doc.nodes.guide).toBeUndefined();
    expect(useDocumentStore.getState().doc.rootChildIds).toEqual(["shape"]);
    expect(useDocumentStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it("rejects an invalid graph without altering the current document", async () => {
    registerPlugin({
      id: "test.invalid-clip",
      name: "Invalid clip",
      commands: [
        {
          id: "go",
          label: "Go",
          run: (api) => {
            api.updateNode("shape", { clipPathId: "missing" } as Partial<SceneNode>);
          },
        },
      ],
    });

    await expect(runPluginCommand("test.invalid-clip", "go")).rejects.toThrow(
      /invalid document/i,
    );
    expect(useDocumentStore.getState().doc.nodes.shape.clipPathId ?? null).toBeNull();
    expect(useDocumentStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it("commits a successful multi-mutation as one undo transaction", async () => {
    registerBuiltinPlugins();
    await runPluginCommand("savage.duplicate-offset", "run");

    const state = useDocumentStore.getState();
    expect(state.doc.rootChildIds).toHaveLength(2);
    expect(state.doc.nodes.shape).toBeTruthy();
    expect(state.selection).toHaveLength(1);
    expect(state.selection[0]).not.toBe("shape");
    expect(useDocumentStore.temporal.getState().pastStates).toHaveLength(1);

    useDocumentStore.temporal.getState().undo();
    expect(useDocumentStore.getState().doc.rootChildIds).toEqual(["shape"]);
    expect(useDocumentStore.getState().doc.nodes[state.selection[0]]).toBeUndefined();
  });

  it("does not apply a stale result after the live document changed", async () => {
    let finish!: () => void;
    registerPlugin({
      id: "test.stale",
      name: "Stale",
      commands: [
        {
          id: "go",
          label: "Go",
          run: async (api) => {
            api.addNode(rect("guide", 40));
            await new Promise<void>((resolve) => {
              finish = resolve;
            });
          },
        },
      ],
    });

    const pending = runPluginCommand("test.stale", "go");
    useDocumentStore.getState().addNode(rect("user", 80));
    finish();

    await expect(pending).rejects.toThrow(/document changed/i);
    expect(useDocumentStore.getState().doc.nodes.guide).toBeUndefined();
    expect(useDocumentStore.getState().doc.nodes.user).toBeTruthy();
  });

  it("rejects a second command while one is still running", async () => {
    let finish!: () => void;
    registerPlugin({
      id: "test.busy",
      name: "Busy",
      commands: [
        {
          id: "go",
          label: "Go",
          run: () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        },
      ],
    });

    const pending = runPluginCommand("test.busy", "go");
    await expect(runPluginCommand("test.busy", "go")).rejects.toThrow(/already running/i);
    finish();
    await pending;
  });
});
