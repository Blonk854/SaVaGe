import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WINDOW_DEFAULT, WINDOW_MIN } from "../ui/windowLayout";

const root = resolve(__dirname, "../../..");

function readTauriConfig() {
  return JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8")) as {
    identifier: string;
    bundle: {
      targets: string[];
      fileAssociations?: unknown;
      resources: string[];
      windows: {
        allowDowngrades?: boolean;
        webviewInstallMode?: { type: string; silent?: boolean };
        nsis?: { installMode?: string };
      };
    };
    app: { windows: Array<{ minWidth: number; minHeight: number; width: number; height: number }> };
  };
}

describe("install contract", () => {
  it("installs per-user NSIS without file associations and with a WebView2 bootstrapper", () => {
    const tauri = readTauriConfig();
    expect(tauri.identifier).toBe("com.savage.svgstudio");
    expect(tauri.bundle.targets).toEqual(["nsis"]);
    expect(tauri.bundle.fileAssociations).toBeUndefined();
    expect(tauri.bundle.resources).toContain("resources/USER_MANUAL.pdf");
    expect(tauri.bundle.windows.nsis?.installMode).toBe("currentUser");
    expect(tauri.bundle.windows.allowDowngrades).toBe(true);
    expect(tauri.bundle.windows.webviewInstallMode).toEqual({
      type: "downloadBootstrapper",
      silent: true,
    });
  });

  it("keeps the packaged window at the 200% scaling minimum", () => {
    const window = readTauriConfig().app.windows[0];
    expect(window.minWidth).toBe(WINDOW_MIN.width);
    expect(window.minHeight).toBe(WINDOW_MIN.height);
    expect(window.width).toBe(WINDOW_DEFAULT.width);
    expect(window.height).toBe(WINDOW_DEFAULT.height);
  });
});
