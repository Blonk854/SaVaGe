import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import clsx from "clsx";
import { focusListSibling, isTypingTarget } from "./keyboard";

interface Props {
  id: string;
  label: string;
  selected: boolean;
  tabStop: boolean;
  onSelect: (id: string) => void;
  onRename?: (id: string) => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function ListRow({
  id,
  label,
  selected,
  tabStop,
  onSelect,
  onRename,
  className,
  style,
  children,
}: Props) {
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      if (isTypingTarget(event.target)) return;
      if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onSelect(id);
      return;
    }
    if (event.key === "F2" && onRename) {
      event.preventDefault();
      event.stopPropagation();
      onRename(id);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    const next = focusListSibling(event.currentTarget, event.key === "ArrowDown" ? 1 : -1);
    const nextId = next?.dataset.id;
    if (nextId) onSelect(nextId);
  };

  return (
    <div
      role="option"
      data-list-row
      data-id={id}
      tabIndex={tabStop ? 0 : -1}
      aria-selected={selected}
      aria-label={label}
      className={clsx("list-row", selected && "selected", className)}
      style={style}
      onClick={() => onSelect(id)}
      onDoubleClick={() => onRename?.(id)}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
