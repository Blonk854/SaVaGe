import clsx from "clsx";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label: string;
}

export function IconButton({
  active,
  label,
  className,
  children,
  ...rest
}: PropsWithChildren<Props>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx("icon-btn", "tool-btn", active && "active", className)}
      {...rest}
    >
      {children}
      <style>{`
        .icon-btn {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border: 1px solid transparent;
          border-radius: 10px;
          background: transparent;
          color: var(--fg-1);
          transition: color 140ms ease, background 140ms ease;
        }
        .icon-btn:hover { color: var(--fg-0); background: rgba(255,255,255,0.04); }
        .icon-btn.active { color: var(--accent); background: rgba(184,255,60,0.08); }
        .icon-btn svg { width: 18px; height: 18px; }
      `}</style>
    </button>
  );
}
