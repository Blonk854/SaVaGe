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

const recorded012 = {
  version: "0.1.2",
  gitTag: "v0.1.2",
  sha256: "660206b722e3f284ea447758fc3434af74744c6a2fbb31ff1e203e6a8c5d4575",
  fileName: "SaVaGe_0.1.2_x64-setup.exe",
  verified: true as const,
  compatibilityNotes: "docs/engineering/m8-compatibility.md",
};

describe("verified installer retention", () => {
  it("keeps previous installers and compatibility notes without an updater", () => {
    const catalog = parseInstallerCatalog(JSON.parse(read("docs/engineering/verified-installers.json")));
    expect(catalog.autoUpdater).toBe(false);
    expect(catalog.distribution).toBe("manual-reinstall");
    expect(catalog.retainPrevious).toBe(true);
    expect(catalog.installers).toEqual([recorded012]);
    assertCompatibilityNotesExist(catalog, root);
    expect(installerFileName("0.1.2")).toBe("SaVaGe_0.1.2_x64-setup.exe");
    expect(read("USER_MANUAL.md")).toMatch(/no automatic updater/i);
    expect(read("USER_MANUAL.md")).toMatch(/Keep the older setup file/i);
  });

  it("appends a new verified installer and refuses to replace retained bytes", () => {
    const catalog = parseInstallerCatalog(JSON.parse(read("docs/engineering/verified-installers.json")));
    const next = {
      version: "0.1.3",
      gitTag: "v0.1.3",
      sha256: "bbb",
      verified: true as const,
    };
    const withNext = retainVerifiedInstaller(catalog, next);
    expect(withNext.installers.map((installer) => installer.gitTag)).toEqual(["v0.1.2", "v0.1.3"]);
    expect(retainVerifiedInstaller(withNext, catalog.installers[0]).installers.map((installer) => installer.gitTag)).toEqual([
      "v0.1.2",
      "v0.1.3",
    ]);
    expect(() =>
      retainVerifiedInstaller(withNext, { ...catalog.installers[0], sha256: "ccc" }),
    ).toThrow(/different bytes/);
    expect(catalog.installers).toEqual([recorded012]);
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

  it("lists the recorded 0.1.2 catalog from the CLI", () => {
    const output = execFileSync("node", [resolve(root, "scripts/retain-installer.mjs"), "list"], {
      encoding: "utf8",
      cwd: root,
    });
    const listed = JSON.parse(output) as { retainPrevious: boolean; installers: typeof recorded012[] };
    expect(listed.retainPrevious).toBe(true);
    expect(listed.installers).toEqual([recorded012]);
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
