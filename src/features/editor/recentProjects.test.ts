import { describe, expect, it } from "vitest";
import { parseRecentProjectsView, recentMenuLabel } from "./recentProjects";

describe("recent projects view", () => {
  it("labels a project with its parent folder and rejects a path field", () => {
    expect(recentMenuLabel({ displayName: "poster", parentLabel: "Projects" })).toBe(
      "poster — Projects",
    );
    expect(recentMenuLabel({ displayName: "  ", parentLabel: "" })).toBe("Untitled");

    const view = parseRecentProjectsView({
      reopenLastProject: false,
      projects: [
        { id: "recent_1", displayName: "poster", parentLabel: "Projects", openedAtMs: 10 },
      ],
    });
    expect(view.projects).toEqual([
      { id: "recent_1", displayName: "poster", parentLabel: "Projects", openedAtMs: 10 },
    ]);
    expect(() =>
      parseRecentProjectsView({
        reopenLastProject: true,
        projects: [
          {
            id: "recent_1",
            displayName: "poster",
            parentLabel: "Projects",
            openedAtMs: 10,
            path: "C:\\secret\\poster.savage",
          },
        ],
      }),
    ).toThrow(/invalid/i);
  });
});
