import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { listPlugins, runPluginCommand } from "./api";
import { useUiStore } from "../stores/uiStore";
import { useState } from "react";

interface Props {
  onNotify?: (msg: string) => void;
}

export function PluginsPanel({ onNotify }: Props) {
  const [, bump] = useState(0);
  const plugins = listPlugins();

  return (
    <Panel title="Plugins">
      <div className="plugs">
        {!plugins.length && <p className="muted empty">No plugins registered</p>}
        {plugins.map((p) => (
          <div key={p.id} className="plugs__card">
            <strong>{p.name}</strong>
            {p.description && <p className="muted">{p.description}</p>}
            {p.commands.map((c) => (
              <Button
                key={c.id}
                variant="subtle"
                onClick={() => {
                  void runPluginCommand(p.id, c.id)
                    .then(() => bump((n) => n + 1))
                    .catch((e) =>
                      onNotify?.(e instanceof Error ? e.message : String(e)),
                    );
                  useUiStore.getState().markDirty();
                }}
              >
                {c.label}
              </Button>
            ))}
          </div>
        ))}
      </div>
      <style>{`
        .plugs { display: grid; gap: 0.65rem; }
        .plugs__card {
          display: grid;
          gap: 0.35rem;
          padding: 0.55rem;
          border-radius: 8px;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border);
        }
        .plugs__card strong { font-size: 0.82rem; }
        .plugs__card p { margin: 0; font-size: 0.72rem; }
        .empty { font-size: 0.78rem; padding: 0.35rem; }
      `}</style>
    </Panel>
  );
}
