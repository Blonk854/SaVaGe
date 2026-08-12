import type { PropsWithChildren, ReactNode } from "react";

interface Props {
  title: string;
  actions?: ReactNode;
  className?: string;
}

export function Panel({ title, actions, className, children }: PropsWithChildren<Props>) {
  return (
    <section className={`sv-panel panel-enter ${className ?? ""}`}>
      <header className="sv-panel__head">
        <h2>{title}</h2>
        {actions}
      </header>
      <div className="sv-panel__body">{children}</div>
      <style>{`
        .sv-panel {
          display: flex;
          flex-direction: column;
          min-height: 0;
          background: var(--bg-1);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
        }
        .sv-panel__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          padding: 0.55rem 0.75rem;
          border-bottom: 1px solid var(--border);
        }
        .sv-panel__head h2 {
          margin: 0;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--fg-1);
          font-weight: 600;
        }
        .sv-panel__body {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding: 0.5rem;
        }
      `}</style>
    </section>
  );
}
