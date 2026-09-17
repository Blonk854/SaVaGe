import { nanoid } from "nanoid";
import { useDocumentStore } from "../stores/documentStore";
import { useUiStore } from "../stores/uiStore";
import {
  projectContents,
  useProjectSessionStore,
} from "../stores/projectSessionStore";
import { validateSavageDocument } from "../document/parseSavage";
import { recordDiagnostic } from "../diagnostics";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type NodeId,
  type SceneNode,
  type SvgDocument,
} from "../document/types";
import { documentToSvgString } from "../document/serialize";

export interface PluginCommand {
  id: string;
  label: string;
  run: (api: SavagePluginApi) => void | Promise<void>;
}

export interface SavagePlugin {
  id: string;
  name: string;
  description?: string;
  commands: PluginCommand[];
}

export interface SavagePluginApi {
  getSelectionIds: () => string[];
  getNode: (id: string) => SceneNode | undefined;
  updateNode: (id: string, patch: Partial<SceneNode>) => void;
  addNode: (node: SceneNode) => void;
  deleteNodes: (ids: string[]) => void;
  setSelection: (ids: string[]) => void;
  exportSvg: () => string;
  notify: (message: string) => void;
  markDirty: () => void;
}

interface PluginWorkingState {
  doc: SvgDocument;
  selection: NodeId[];
}

type NotifyFn = (msg: string) => void;

const registry = new Map<string, SavagePlugin>();
let notifyFn: NotifyFn = (msg) => console.info(`[plugin] ${msg}`);
let pluginCommandRunning = false;

export function setPluginNotifier(fn: NotifyFn) {
  notifyFn = fn;
}

function collectDescendants(doc: SvgDocument, id: NodeId, out: Set<NodeId>) {
  out.add(id);
  const node = doc.nodes[id];
  if (node?.type === "group") {
    for (const childId of node.children) collectDescendants(doc, childId, out);
  }
}

function pluginFailure(pluginName: string, error: unknown, kind = "failed"): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Plugin "${pluginName}" ${kind}: ${message}`);
}

/**
 * Built-in plugin commands are trusted application code, not a sandbox.
 * The API mutates an isolated working copy; live document nodes are never returned.
 */
export function createPluginApi(working: PluginWorkingState): SavagePluginApi {
  return {
    getSelectionIds: () => [...working.selection],
    getNode: (id) => {
      const node = working.doc.nodes[id];
      return node ? structuredClone(node) : undefined;
    },
    updateNode: (id, patch) => {
      const node = working.doc.nodes[id];
      if (!node) return;
      Object.assign(node, structuredClone(patch), { id: node.id, type: node.type });
    },
    addNode: (node) => {
      const copy = structuredClone(node);
      if (Object.hasOwn(working.doc.nodes, copy.id)) {
        throw new Error(`Node id ${copy.id} already exists`);
      }
      working.doc.nodes[copy.id] = copy;
      working.doc.rootChildIds.push(copy.id);
      working.selection = [copy.id];
    },
    deleteNodes: (ids) => {
      const doomed = new Set<NodeId>();
      for (const id of ids) collectDescendants(working.doc, id, doomed);
      working.doc.rootChildIds = working.doc.rootChildIds.filter((id) => !doomed.has(id));
      for (const node of Object.values(working.doc.nodes)) {
        if (node.type === "group") {
          node.children = node.children.filter((id) => !doomed.has(id));
        }
        if (node.clipPathId && doomed.has(node.clipPathId)) {
          node.clipPathId = null;
        }
      }
      for (const id of doomed) delete working.doc.nodes[id];
      working.selection = working.selection.filter((id) => !doomed.has(id));
    },
    setSelection: (ids) => {
      working.selection = [...ids];
    },
    exportSvg: () => documentToSvgString(working.doc),
    notify: (message) => notifyFn(message),
    markDirty: () => useUiStore.getState().markDirty(),
  };
}

export function registerPlugin(plugin: SavagePlugin) {
  registry.set(plugin.id, plugin);
}

export function unregisterPlugin(id: string) {
  registry.delete(id);
}

export function listPlugins(): SavagePlugin[] {
  return [...registry.values()];
}

export async function runPluginCommand(pluginId: string, commandId: string) {
  const plugin = registry.get(pluginId);
  const cmd = plugin?.commands.find((c) => c.id === commandId);
  if (!cmd) throw new Error(`Unknown plugin command ${pluginId}.${commandId}`);
  if (pluginCommandRunning) {
    throw new Error("Another plugin command is already running");
  }

  pluginCommandRunning = true;
  const sessionId = useProjectSessionStore.getState().sessionId;
  try {
    const store = useDocumentStore.getState();
    const baseline = projectContents(store.doc);
    const working: PluginWorkingState = {
      doc: structuredClone(store.doc),
      selection: [...store.selection],
    };

    try {
      await cmd.run(createPluginApi(working));
    } catch (error) {
      throw pluginFailure(plugin.name, error);
    }

    if (
      useProjectSessionStore.getState().sessionId !== sessionId ||
      projectContents(useDocumentStore.getState().doc) !== baseline
    ) {
      throw new Error(
        `Plugin "${plugin.name}" did not apply because the document changed while it was running`,
      );
    }

    if (projectContents(working.doc) === baseline) {
      useDocumentStore.getState().commitDocument(
        useDocumentStore.getState().doc,
        working.selection,
      );
      return;
    }

    let validated: SvgDocument;
    try {
      validated = validateSavageDocument(working.doc);
    } catch (error) {
      throw pluginFailure(plugin.name, error, "produced an invalid document");
    }

    useDocumentStore.getState().commitDocument(validated, working.selection);
    useUiStore.getState().markDirty();
  } catch (error) {
    recordDiagnostic({
      level: "error",
      code: "plugin_failed",
      operation: "plugin",
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    pluginCommandRunning = false;
  }
}

/** Built-in demo plugins ship with the app. */
export function registerBuiltinPlugins() {
  registerPlugin({
    id: "savage.duplicate-offset",
    name: "Duplicate & Offset",
    description: "Copy selection 24px down-right",
    commands: [
      {
        id: "run",
        label: "Duplicate selection + offset",
        run: (api) => {
          const ids = api.getSelectionIds();
          if (!ids.length) {
            api.notify("Select something first");
            return;
          }
          const newIds: string[] = [];
          for (const id of ids) {
            const node = api.getNode(id);
            if (!node || node.type === "group") continue;
            const copy = structuredClone(node) as SceneNode;
            copy.id = nanoid(10);
            copy.name = `${node.name} copy`;
            copy.transform = {
              ...copy.transform,
              x: copy.transform.x + 24,
              y: copy.transform.y + 24,
            };
            api.addNode(copy);
            newIds.push(copy.id);
          }
          api.setSelection(newIds);
          api.markDirty();
          api.notify(`Duplicated ${newIds.length} object(s)`);
        },
      },
    ],
  });

  registerPlugin({
    id: "savage.randomize-fills",
    name: "Randomize Fills",
    description: "Assign random accent fills to selection",
    commands: [
      {
        id: "run",
        label: "Randomize selected fills",
        run: (api) => {
          const palette = ["#B8FF3C", "#22D3EE", "#A78BFA", "#F472B6", "#FBBF24"];
          let n = 0;
          for (const id of api.getSelectionIds()) {
            const node = api.getNode(id);
            if (!node || !("fill" in node)) continue;
            const color = palette[Math.floor(Math.random() * palette.length)];
            api.updateNode(id, { fill: solidFill(color) } as Partial<SceneNode>);
            n++;
          }
          api.markDirty();
          api.notify(n ? `Randomized ${n} fill(s)` : "No fillable selection");
        },
      },
    ],
  });

  registerPlugin({
    id: "savage.add-guide-rect",
    name: "Add Guide Rect",
    description: "Insert a translucent guide rectangle",
    commands: [
      {
        id: "run",
        label: "Add guide rectangle",
        run: (api) => {
          api.addNode({
            id: nanoid(10),
            name: "Guide",
            type: "rect",
            visible: true,
            locked: false,
            opacity: 0.35,
            blendMode: "normal",
            transform: defaultTransform(40, 40),
            width: 160,
            height: 100,
            rx: 0,
            ry: 0,
            fill: solidFill("#22D3EE", 0.35),
            stroke: defaultStroke("#22D3EE", 1),
          });
          api.markDirty();
          api.notify("Guide rectangle added");
        },
      },
    ],
  });
}
