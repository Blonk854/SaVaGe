import type { PropsWithChildren, ReactNode } from "react";

interface Props {
  left: ReactNode;
  right: ReactNode;
  ratio?: number;
}

export function SplitPane({ left, right, ratio = 0.5 }: PropsWithChildren<Props>) {
  return (
    <div className="split" style={{ ["--split" as string]: `${ratio * 100}%` }}>
      <div className="split__left">{left}</div>
      <div className="split__right">{right}</div>
      <style>{`
        .split {
          display: grid;
          grid-template-columns: var(--split) 1fr;
          gap: 0.75rem;
          min-height: 0;
          height: 100%;
        }
        .split__left, .split__right {
          min-width: 0;
          min-height: 0;
        }
        @media (max-width: 1100px) {
          .split { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
