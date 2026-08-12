import { nanoid } from "nanoid";
import { useDocumentStore } from "../stores/documentStore";
import { useUiStore } from "../stores/uiStore";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type SceneNode,
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

type NotifyFn = (msg: string) => void;

const registry = new Map<string, SavagePlugin>();
let notifyFn: NotifyFn = (msg) => console.info(`[plugin] ${msg}`);

export function setPluginNotifier(fn: NotifyFn) {
  notifyFn = fn;
}

export function createPluginApi(): SavagePluginApi {
  return {
    getSelectionIds: () => useDocumentStore.getState().selection,
    getNode: (id) => useDocumentStore.getState().doc.nodes[id],
    updateNode: (id, patch) => useDocumentStore.getState().updateNode(id, patch),
    addNode: (node) => useDocumentStore.getState().addNode(node),
    deleteNodes: (ids) => useDocumentStore.getState().deleteNodes(ids),
    setSelection: (ids) => useDocumentStore.getState().setSelection(ids),
    exportSvg: () => documentToSvgString(useDocumentStore.getState().doc),
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
  await cmd.run(createPluginApi());
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
