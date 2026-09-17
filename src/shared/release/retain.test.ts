import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCompatibilityNotesExist,
  installerFileName,
  parseInstallerCatalog,
  retainVerifiedInstaller,
} from "./retain";

const root = resolve(__dirname, "../../..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("verified installer retention", () => {
  it("keeps previous installers and compatibility notes without an updater", () => {
    const catalog = parseInstallerCatalog(JSON.parse(read("docs/engineering/verified-installers.json")));
    expect(catalog.autoUpdater).toBe(false);
    expect(catalog.distribution).toBe("manual-reinstall");
    expect(catalog.retainPrevious).toBe(true);
    expect(catalog.installers).toEqual([]);
    assertCompatibilityNotesExist(catalog, root);
    expect(installerFileName("0.1.0")).toBe("SaVaGe_0.1.0_x64-setup.exe");
    expect(read("USER_MANUAL.md")).toMatch(/no automatic updater/i);
    expect(read("USER_MANUAL.md")).toMatch(/Keep the older setup file/i);
  });

  it("appends a new verified installer and refuses to replace retained bytes", () => {
    const catalog = parseInstallerCatalog(JSON.parse(read("docs/engineering/verified-installers.json")));
    const first = {
      version: "0.1.0",
      gitTag: "v0.1.0",
      sha256: "aaa",
      verified: true as const,
    };
    const second = {
      version: "0.1.1",
      gitTag: "v0.1.1",
      sha256: "bbb",
      verified: true as const,
    };
    const withFirst = retainVerifiedInstaller(catalog, first);
    const withBoth = retainVerifiedInstaller(withFirst, second);
    expect(withBoth.installers).toEqual([first, second]);
    expect(retainVerifiedInstaller(withBoth, first).installers).toEqual([first, second]);
    expect(() => retainVerifiedInstaller(withBoth, { ...first, sha256: "ccc" })).toThrow(
      /different bytes/,
    );
    expect(catalog.installers).toEqual([]);
  });

  it("rejects an updater catalog or dropping previous installers", () => {
    const base = JSON.parse(read("docs/engineering/verified-installers.json")) as Record<string, unknown>;
    expect(() => parseInstallerCatalog({ ...base, autoUpdater: true })).toThrow(/automatic updater/i);
    expect(() => parseInstallerCatalog({ ...base, retainPrevious: false })).toThrow(/must be retained/i);
  });

  it("does not delete previous GitHub Releases when tagging a new NSIS", () => {
    const release = read(".github/workflows/release.yml");
    expect(release).toMatch(/gh release create/);
    expect(release).not.toMatch(/gh release delete/);
    expect(release).toMatch(/Keep previous GitHub Releases/);
    expect(existsSync(resolve(root, "artifacts/verified/.gitignore"))).toBe(true);
    expect(existsSync(resolve(root, "docs/engineering/m8-retain.md"))).toBe(true);
  });

  it("lists the empty 0.1.0 catalog from the CLI", () => {
    const output = execFileSync("node", [resolve(root, "scripts/retain-installer.mjs"), "list"], {
      encoding: "utf8",
      cwd: root,
    });
    const listed = JSON.parse(output) as { retainPrevious: boolean; installers: unknown[] };
    expect(listed.retainPrevious).toBe(true);
    expect(listed.installers).toEqual([]);
  });

  it("refuses to record an installer without provenance sidecars", () => {
    expect(() =>
      execFileSync(
        "node",
        [resolve(root, "scripts/retain-installer.mjs"), "record", "--installer", "missing-setup.exe"],
        { encoding: "utf8", cwd: root },
      ),
    ).toThrow(/--installer/);
  });
});
