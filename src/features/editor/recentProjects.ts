import { invoke, isTauri } from "@tauri-apps/api/core";
import { create } from "zustand";
import { recordDiagnostic } from "../../shared/diagnostics";

export interface RecentProjectEntry {
  id: string;
  displayName: string;
  parentLabel: string;
  openedAtMs: number;
}

export interface RecentProjectsView {
  reopenLastProject: boolean;
  projects: RecentProjectEntry[];
}

type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

interface RecentProjectsState extends RecentProjectsView {
  applyView: (view: RecentProjectsView) => void;
}

const listeners = new Set<() => void>();

export const useRecentProjectsStore = create<RecentProjectsState>((set) => ({
  reopenLastProject: false,
  projects: [],
  applyView: (view) => set(view),
}));

export function recentMenuLabel(entry: Pick<RecentProjectEntry, "displayName" | "parentLabel">): string {
  const name = entry.displayName.trim() || "Untitled";
  const parent = entry.parentLabel.trim();
  return parent ? `${name} — ${parent}` : name;
}

export function parseRecentProjectsView(value: unknown): RecentProjectsView {
  if (!value || typeof value !== "object") {
    throw new Error("Recent projects response was invalid");
  }
  const view = value as { reopenLastProject?: unknown; projects?: unknown };
  if (typeof view.reopenLastProject !== "boolean" || !Array.isArray(view.projects)) {
    throw new Error("Recent projects response was invalid");
  }
  return {
    reopenLastProject: view.reopenLastProject,
    projects: view.projects.slice(0, 10).map((entry) => {
      if (!entry || typeof entry !== "object") {
        throw new Error("Recent projects response was invalid");
      }
      const project = entry as Record<string, unknown>;
      if (
        typeof project.id !== "string" ||
        typeof project.displayName !== "string" ||
        typeof project.parentLabel !== "string" ||
        typeof project.openedAtMs !== "number" ||
        "path" in project
      ) {
        throw new Error("Recent projects response was invalid");
      }
      return {
        id: project.id,
        displayName: project.displayName,
        parentLabel: project.parentLabel,
        openedAtMs: project.openedAtMs,
      };
    }),
  };
}

export function onRecentProjectsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyRecentProjectsChanged(): void {
  for (const listener of listeners) listener();
}

export async function refreshRecentProjects(
  invokeCommand: InvokeFn | null = isTauri() ? invoke : null,
): Promise<void> {
  if (!invokeCommand) return;
  try {
    useRecentProjectsStore.getState().applyView(
      parseRecentProjectsView(await invokeCommand("list_recent_projects")),
    );
  } catch (error) {
    recordDiagnostic({
      level: "warn",
      code: "recent_projects_unavailable",
      operation: "recent_projects",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function setReopenLastProject(
  enabled: boolean,
  invokeCommand: InvokeFn | null = isTauri() ? invoke : null,
): Promise<void> {
  if (!invokeCommand) return;
  const value = await invokeCommand("set_reopen_last_project", { enabled });
  if (typeof value !== "boolean") {
    throw new Error("Could not update the reopen preference");
  }
  useRecentProjectsStore.setState({ reopenLastProject: value });
}
