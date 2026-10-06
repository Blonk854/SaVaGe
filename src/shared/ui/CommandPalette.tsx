import { useEffect, useState } from "react";
import { APP_COMMANDS, filterCommands } from "./commands";
import { adjacentIndex } from "./keyboard";

interface Props {
  open: boolean;
  onClose: () => void;
  onRun: (id: string) => void;
}

export function CommandPalette({ open, onClose, onRun }: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const matches = filterCommands(APP_COMMANDS, query);
  const active = matches.length ? Math.min(index, matches.length - 1) : 0;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
  }, [open]);

  if (!open) return null;

  return (
    <div className="sv-palette" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sv-palette-title"
        className="sv-palette__card"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((current) => adjacentIndex(current, event.key === "ArrowDown" ? 1 : -1, matches.length));
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const command = matches[active];
            if (command) onRun(command.id);
          }
        }}
      >
        <h2 id="sv-palette-title">Commands</h2>
        <input
          autoFocus
          aria-label="Search commands"
          placeholder="Search commands"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
        />
        <ul role="listbox" aria-label="Matching commands">
          {matches.length === 0 && <li className="sv-palette__empty">No matching commands.</li>}
          {matches.map((command, itemIndex) => (
            <li key={command.id}>
              <button
                type="button"
                role="option"
                aria-selected={itemIndex === active}
                onMouseEnter={() => setIndex(itemIndex)}
                onClick={() => onRun(command.id)}
              >
                <span>{command.label}</span>
                <em>{command.shortcut ?? command.group}</em>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <style>{`
        .sv-palette {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: start center;
          padding-top: 12vh;
          background: rgba(10, 12, 16, 0.62);
        }
        .sv-palette__card {
          width: min(32rem, calc(100vw - 2rem));
          display: grid;
          gap: 0.6rem;
          padding: 0.9rem;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--bg-1);
          color: var(--fg-0);
        }
        .sv-palette__card h2 { margin: 0; font-size: 1rem; }
        .sv-palette__card input {
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.45rem 0.6rem;
          color: var(--fg-0);
        }
        .sv-palette__card ul {
          list-style: none;
          margin: 0;
          padding: 0;
          max-height: 18rem;
          overflow: auto;
          display: grid;
          gap: 0.15rem;
        }
        .sv-palette__card button {
          width: 100%;
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          text-align: left;
          background: transparent;
          border: 0;
          border-radius: 6px;
          padding: 0.4rem 0.5rem;
          color: var(--fg-0);
        }
        .sv-palette__card button[aria-selected="true"] { background: rgba(184,255,60,0.12); }
        .sv-palette__card em {
          font-style: normal;
          color: var(--fg-1);
          font-size: var(--text-xs);
        }
        .sv-palette__empty { padding: 0.4rem 0.5rem; color: var(--fg-1); }
      `}</style>
    </div>
  );
}
