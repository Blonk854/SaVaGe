import { useEffect } from "react";
import { Button } from "./Button";
import { APP_COMMANDS, type CommandSpec } from "./commands";

interface Props {
  open: boolean;
  onClose: () => void;
}

const GROUPS = ["File", "Edit", "View", "Tools", "Help"] as const;

export function ShortcutReference({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sv-shortcuts" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="sv-shortcuts-title" className="sv-shortcuts__card">
        <h2 id="sv-shortcuts-title">Keyboard shortcuts</h2>
        <p>Tool keys apply on the artboard. They stay quiet while you type in a field.</p>
        {GROUPS.map((group) => {
          const commands = APP_COMMANDS.filter((command) => command.group === group && command.shortcut);
          if (!commands.length) return null;
          return (
            <section key={group}>
              <h3>{group}</h3>
              <ul>
                {commands.map((command) => (
                  <ShortcutRow key={command.id} command={command} />
                ))}
              </ul>
            </section>
          );
        })}
        <div className="sv-shortcuts__actions">
          <Button autoFocus onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      <style>{`
        .sv-shortcuts {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          background: rgba(10, 12, 16, 0.62);
        }
        .sv-shortcuts__card {
          width: min(36rem, calc(100vw - 2rem));
          max-height: min(80vh, 40rem);
          overflow: auto;
          display: grid;
          gap: 0.7rem;
          padding: 1.1rem 1.15rem 1rem;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--bg-1);
          color: var(--fg-0);
        }
        .sv-shortcuts__card h2, .sv-shortcuts__card h3, .sv-shortcuts__card p { margin: 0; }
        .sv-shortcuts__card h2 { font-size: 1rem; }
        .sv-shortcuts__card h3 { font-size: var(--text-sm); color: var(--fg-1); }
        .sv-shortcuts__card p { color: var(--fg-1); font-size: var(--text-sm); }
        .sv-shortcuts__card ul { list-style: none; margin: 0.3rem 0 0; padding: 0; display: grid; gap: 0.25rem; }
        .sv-shortcuts__card li { display: flex; justify-content: space-between; gap: 1rem; }
        .sv-shortcuts__card kbd {
          font-family: inherit;
          font-size: var(--text-xs);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.1rem 0.35rem;
        }
        .sv-shortcuts__actions { display: flex; justify-content: flex-end; }
      `}</style>
    </div>
  );
}

function ShortcutRow({ command }: { command: CommandSpec }) {
  return (
    <li>
      <span>{command.label}</span>
      <kbd>{command.shortcut}</kbd>
    </li>
  );
}
