import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSavageDocument, unsupportedProjectVersionMessage } from "../document/parseSavage";
import { newerWorkAction, parseRollbackPolicy, planRollbackRehearsal } from "./rollback";

const root = resolve(__dirname, "../../..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function copyUnderTemp(relative: string) {
  const dir = mkdtempSync(join(tmpdir(), "savage-rollback-"));
  const dest = join(dir, relative.split(/[/\\]/).pop() ?? "fixture");
  copyFileSync(resolve(root, relative), dest);
  return dest;
}

describe("rollback rehearsal", () => {
  it("does not treat a binary downgrade as document rollback", () => {
    const policy = parseRollbackPolicy(JSON.parse(read("docs/engineering/rollback-policy.json")));
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      identifier: string;
      bundle: { windows?: { allowDowngrades?: boolean } };
    };
    expect(policy.binaryDowngradeIsDocumentRollback).toBe(false);
    expect(policy.retainAppData).toBe(true);
    expect(policy.allowDowngrades).toBe(true);
    expect(tauri.identifier).toBe(policy.identifier);
    expect(tauri.bundle.windows?.allowDowngrades).toBe(true);
    expect(newerWorkAction(1)).toBe("open-compatible");
    expect(newerWorkAction(2)).toBe("leave-in-place");
    expect(() =>
      parseRollbackPolicy({ ...policy, binaryDowngradeIsDocumentRollback: true }),
    ).toThrow(/not document rollback/i);
  });

  it("opens copies of compatible originals without rewriting them", () => {
    const policy = parseRollbackPolicy(JSON.parse(read("docs/engineering/rollback-policy.json")));
    for (const relative of policy.compatibleOriginals) {
      expect(existsSync(resolve(root, relative)), relative).toBe(true);
      const original = read(relative);
      const copyPath = copyUnderTemp(relative);
      const doc = parseSavageDocument(readFileSync(copyPath, "utf8"));
      expect(doc.version).toBe(1);
      expect(readFileSync(copyPath, "utf8")).toBe(original);
    }
  });

  it("leaves newer project and recovery bytes unchanged and requires Save As from a newer writer", () => {
    const policy = parseRollbackPolicy(JSON.parse(read("docs/engineering/rollback-policy.json")));
    const projectOriginal = read(policy.newerWork.project);
    const projectCopy = copyUnderTemp(policy.newerWork.project);
    expect(() => parseSavageDocument(readFileSync(projectCopy, "utf8"))).toThrow(
      unsupportedProjectVersionMessage(2),
    );
    expect(unsupportedProjectVersionMessage(2)).toMatch(/Save As a version-1 copy/i);
    expect(readFileSync(projectCopy, "utf8")).toBe(projectOriginal);

    const recoveryOriginal = read(policy.newerWork.recovery);
    const recovery = JSON.parse(recoveryOriginal) as { formatVersion: number; contents: string };
    expect(recovery.formatVersion).toBeGreaterThan(1);
    expect(() => parseSavageDocument(recovery.contents)).toThrow(/version 2/);
    expect(read(policy.newerWork.recovery)).toBe(recoveryOriginal);
    expect(policy.newerWork.onOpen).toBe("leave-in-place");
    expect(policy.newerWork.compatibleExport).toMatch(/Save As/i);
    expect(read("src-tauri/src/commands/recovery.rs")).toMatch(
      /unsupported_recovery_versions_are_left_unchanged/,
    );
  });

  it("uses the last different catalogued tag as the prior NSIS", () => {
    const plan = planRollbackRehearsal({
      policy: JSON.parse(read("docs/engineering/rollback-policy.json")),
      registry: JSON.parse(read("docs/engineering/verified-installers.json")),
      currentVersion: (JSON.parse(read("package.json")) as { version: string }).version,
    });
    expect(plan.priorInstaller).toEqual(
      expect.objectContaining({ gitTag: "v0.1.2", verified: true }),
    );
    expect(plan.liveNsisBlocked).toBe(false);
    expect(plan.notes).toMatch(/v0.1.2/);
    expect(
      planRollbackRehearsal({
        policy: JSON.parse(read("docs/engineering/rollback-policy.json")),
        registry: {
          policyVersion: 1,
          installers: [
            { version: "0.0.9", gitTag: "v0.0.9", sha256: "abc", verified: true },
          ],
        },
        currentVersion: "0.1.0",
      }).liveNsisBlocked,
    ).toBe(false);
    expect(
      planRollbackRehearsal({
        policy: JSON.parse(read("docs/engineering/rollback-policy.json")),
        registry: { policyVersion: 1, installers: [] },
        currentVersion: "0.1.0",
      }).liveNsisBlocked,
    ).toBe(true);
    expect(read("USER_MANUAL.md")).toMatch(/convert newer documents to version 1/i);
    expect(read(".github/workflows/release.yml")).not.toMatch(/tauri-plugin-updater/);
  });

  it("prints a rehearsal plan from the CLI without running an installer", () => {
    const output = execFileSync("node", [resolve(root, "scripts/rehearse-rollback.mjs")], {
      encoding: "utf8",
      cwd: root,
    });
    const plan = JSON.parse(output) as {
      liveNsisBlocked: boolean;
      priorInstaller: { gitTag?: string } | null;
      copies: unknown[];
      binaryDowngradeIsDocumentRollback: boolean;
    };
    expect(plan.liveNsisBlocked).toBe(false);
    expect(plan.priorInstaller?.gitTag).toBe("v0.1.2");
    expect(plan.binaryDowngradeIsDocumentRollback).toBe(false);
    expect(plan.copies.length).toBeGreaterThanOrEqual(3);
  });
});
