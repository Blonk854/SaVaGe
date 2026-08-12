import clsx from "clsx";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Variant = "primary" | "ghost" | "danger" | "subtle";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({
  variant = "subtle",
  className,
  children,
  ...rest
}: PropsWithChildren<Props>) {
  return (
    <button
      className={clsx("sv-btn", `sv-btn--${variant}`, className)}
      type="button"
      {...rest}
    >
      {children}
      <style>{`
        .sv-btn {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.45rem 0.85rem;
          background: var(--bg-2);
          transition: background 140ms ease, border-color 140ms ease, transform 120ms ease;
        }
        .sv-btn:hover:not(:disabled) { border-color: rgba(184,255,60,0.35); }
        .sv-btn:active:not(:disabled) { transform: translateY(1px); }
        .sv-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .sv-btn--primary {
          background: var(--accent);
          color: var(--accent-ink);
          border-color: transparent;
          font-weight: 600;
        }
        .sv-btn--ghost { background: transparent; }
        .sv-btn--danger { background: rgba(255,92,92,0.12); border-color: rgba(255,92,92,0.35); color: #ffb3b3; }
      `}</style>
    </button>
  );
}
