import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { exportDiagnostics } from "../diagnostics";
import {
  assertHaltPolicy,
  HALT_TRIGGERS,
  parseVerifiedInstallerRegistry,
  planWithdraw,
  resolvePriorVerifiedInstaller,
} from "./halt";
import { parseRolloutPolicy } from "./rolloutPolicy";

const root = resolve(__dirname, "../../..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("halt and withdraw", () => {
  it("halts promotion on corruption, missing recovery, critical security, or failed install", () => {
    const policy = parseRolloutPolicy(JSON.parse(read("docs/engineering/rollout-policy.json")));
    assertHaltPolicy(policy);
    expect(policy.halt.triggers).toEqual([...HALT_TRIGGERS]);
    expect(policy.halt.diagnostics).toMatch(/Export Diagnostics/i);
    expect(policy.halt.diagnostics).toMatch(/No automatic upload/i);
    expect(policy.halt.preserve.join("\n")).toMatch(/\.savage/);
    expect(policy.halt.preserve.join("\n")).toMatch(/recovery/i);
  });

  it("offers no prior installer for 0.1.0 and does not invent one", () => {
    const registry = parseVerifiedInstallerRegistry(
      JSON.parse(read("docs/engineering/verified-installers.json")),
    );
    expect(registry.installers).toEqual([]);
    expect(resolvePriorVerifiedInstaller(registry, "0.1.0")).toBeNull();
    const plan = planWithdraw({
      tag: "v0.1.0",
      trigger: "confirmed-corruption",
      policy: JSON.parse(read("docs/engineering/rollout-policy.json")),
      registry,
    });
    expect(plan.halt).toBe(true);
    expect(plan.offerPrior).toBeNull();
    expect(plan.github).toEqual({
      draft: true,
      prerelease: true,
      deleteRelease: false,
      deleteTag: false,
    });
    expect(plan.preserve).toEqual({
      documents: true,
      recovery: true,
      diagnosticsConsentRequired: true,
    });
    expect(plan.notes).toMatch(/WITHDRAWN/);
    expect(plan.notes).toMatch(/No prior verified installer/);
    expect(plan.notes).toMatch(/binary downgrade is not document rollback/i);
    expect(plan.forbidden.join("\n")).toMatch(/gh release delete/i);
    expect(plan.forbidden.join("\n")).toMatch(/git tag -d/i);
    expect(plan.forbidden.join("\n")).toMatch(/Delete the application data/);
  });

  it("offers the last verified installer that is not the withdrawn version", () => {
    const prior = {
      version: "0.0.9",
      gitTag: "v0.0.9",
      sha256: "abc",
      verified: true as const,
    };
    expect(
      resolvePriorVerifiedInstaller({ policyVersion: 1, installers: [prior] }, "0.1.0"),
    ).toEqual(prior);
    expect(
      resolvePriorVerifiedInstaller({ policyVersion: 1, installers: [prior] }, "0.0.9"),
    ).toBeNull();
  });

  it("collects diagnostics only after the user confirms", async () => {
    const calls: string[] = [];
    expect(
      await exportDiagnostics(
        async () => false,
        async (command) => {
          calls.push(command);
          return "unused";
        },
      ),
    ).toBeNull();
    expect(calls).toEqual([]);
  });

  it("withdraws by drafting the GitHub Release instead of deleting tags or user files", () => {
    const release = read(".github/workflows/release.yml");
    const script = read("scripts/withdraw-release.mjs");
    const manual = read("USER_MANUAL.md");
    expect(release).not.toMatch(/gh release delete/);
    expect(release).not.toMatch(/git tag -d/);
    expect(script).toMatch(/--draft/);
    expect(script).toMatch(/--prerelease/);
    expect(script).not.toMatch(/gh release delete/);
    expect(script).not.toMatch(/git tag -d/);
    expect(script).toMatch(/Do not uninstall with Delete the application data/);
    expect(manual).toMatch(/withdrawn/i);
    expect(manual).toMatch(/last verified/i);
    expect(existsSync(resolve(root, "docs/engineering/m8-withdraw.md"))).toBe(true);
  });

  it("refuses withdraw without a halt trigger or a vX.Y.Z tag", () => {
    const policy = JSON.parse(read("docs/engineering/rollout-policy.json"));
    const registry = JSON.parse(read("docs/engineering/verified-installers.json"));
    expect(() =>
      planWithdraw({
        tag: "v0.1.0",
        trigger: "percentage-rollout" as never,
        policy,
        registry,
      }),
    ).toThrow(/halt trigger/i);
    expect(() =>
      planWithdraw({ tag: "latest", trigger: "failed-install", policy, registry }),
    ).toThrow(/vX\.Y\.Z/);
  });

  it("prints a withdraw plan from the tagged CLI without calling gh", () => {
    const output = execFileSync(
      "node",
      [
        resolve(root, "scripts/withdraw-release.mjs"),
        "plan",
        "--tag",
        "v0.1.0",
        "--reason",
        "failed-install",
      ],
      { encoding: "utf8", cwd: root },
    );
    const plan = JSON.parse(output) as { halt: boolean; offerPrior: unknown; github: { deleteTag: boolean } };
    expect(plan.halt).toBe(true);
    expect(plan.offerPrior).toBeNull();
    expect(plan.github.deleteTag).toBe(false);
  });
});
