import type { ReactNode } from "react";
import clsx from "clsx";

export type StatusKind = "info" | "success" | "warn" | "error" | "mixed" | "loading";

interface Props {
  kind: StatusKind;
  children: ReactNode;
  onDismiss?: () => void;
}

export function StatusBanner({ kind, children, onDismiss }: Props) {
  const role = kind === "error" ? "alert" : kind === "loading" || kind === "mixed" ? "status" : undefined;
  return (
    <div className={clsx("sv-status", `sv-status--${kind}`)} role={role}>
      <div className="sv-status__body">{children}</div>
      {onDismiss && (
        <button type="button" className="sv-status__dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
