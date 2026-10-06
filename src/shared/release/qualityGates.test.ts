import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

type Gate = {
  id: string;
  enforcement: string;
  workflowCommand?: string;
  packageCommand?: string;
  surfaces?: string[];
  includes?: string[];
  evidence?: string;
};

type Artifact = {
  path: string;
  ifNoFilesFound: "warn" | "error";
  surfaces?: string[];
};

type QualityPolicy = {
  coverage: {
    mode: string;
    repositoryPercentageGate: boolean;
    upload: string;
    provider: string;
    providerVersion: string;
  };
  triggers: {
    pullRequest: boolean;
    protectedBranches: string[];
    schedule: string;
    releaseTags: string;
  };
  artifacts: Record<string, Artifact>;
  gates: Gate[];
};

function surfaceText(surface: string) {
  if (surface === "check") return read(".github/workflows/check.yml");
  if (surface === "release") return read(".github/workflows/release.yml");
  if (surface === "release:package") return read("scripts/release-package.ps1");
  throw new Error(`Unknown surface ${surface}`);
}

describe("CI quality gates", () => {
  const policy = JSON.parse(read("docs/engineering/quality-gates.json")) as QualityPolicy;
  const check = read(".github/workflows/check.yml");
  const release = read(".github/workflows/release.yml");

  it("keeps coverage as an optional report with no repository-wide percentage gate", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const viteConfig = read("vite.config.ts");
    expect(policy.coverage.mode).toBe("report-only");
    expect(policy.coverage.repositoryPercentageGate).toBe(false);
    expect(policy.coverage.upload).toBe("optional-artifact");
    expect(pkg.devDependencies[policy.coverage.provider]).toBe(policy.coverage.providerVersion);
    expect(pkg.scripts["test:coverage"]).toContain("--coverage");
    expect(pkg.scripts["check:ci"]).toContain("test:coverage");
    expect(viteConfig).toContain('provider: "v8"');
    expect(viteConfig).not.toMatch(/thresholds/);
    expect(`${viteConfig}\n${check}\n${release}`).not.toMatch(/coverageThreshold/);
    const lock = read("pnpm-lock.yaml");
    expect(lock).toContain(`vitest@${policy.coverage.providerVersion}`);
    expect(lock).toContain(`@vitest/coverage-v8@${policy.coverage.providerVersion}`);
  });

  it("runs failing gates on pull requests, protected branches, and tagged releases", () => {
    expect(policy.triggers.pullRequest).toBe(true);
    expect(policy.triggers.protectedBranches).toEqual(["main", "master"]);
    expect(check).toMatch(/pull_request:/);
    expect(check).toContain(`branches: [${policy.triggers.protectedBranches.join(", ")}]`);
    expect(check).toContain(`cron: "${policy.triggers.schedule}"`);
    expect(release).toContain(`'${policy.triggers.releaseTags}'`);
    expect(release).not.toMatch(/pull_request/);
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    for (const gate of policy.gates) {
      if (gate.evidence) expect(read(gate.evidence).length).toBeGreaterThan(0);
      for (const piece of gate.includes ?? []) {
        expect(pkg.scripts["check:ci"], gate.id).toContain(piece);
      }
      for (const surface of gate.surfaces ?? []) {
        const expected =
          surface === "release:package" && gate.workflowCommand?.startsWith("pnpm ")
            ? `Invoke-Pnpm ${gate.workflowCommand.slice("pnpm ".length)}`
            : gate.workflowCommand;
        expect(surfaceText(surface), `${gate.id} on ${surface}`).toContain(expected);
      }
      if (gate.packageCommand) {
        expect(read("scripts/release-package.ps1"), gate.id).toContain(gate.packageCommand);
      }
    }
    expect(release).toContain("--rust-audit passed");
    expect(read("scripts/release-package.ps1")).not.toContain("--rust-audit passed");
  });

  it("uploads test, coverage, and benchmark reports without blocking on a missing report", () => {
    for (const artifact of Object.values(policy.artifacts)) {
      for (const surface of artifact.surfaces ?? ["check", "release"]) {
        const text = surfaceText(surface);
        expect(text).toContain(artifact.path.replace(/\/$/, ""));
        expect(text).toContain(`if-no-files-found: ${artifact.ifNoFilesFound}`);
      }
    }
    expect(check).not.toContain("if-no-files-found: error");
    const installerStep = release.split("- name: Upload unsigned artifacts")[1]?.split("- name:")[0] ?? "";
    expect(installerStep).toContain("if-no-files-found: error");
    expect(installerStep).not.toContain("continue-on-error");
    expect(check.match(/continue-on-error: true/g)).toHaveLength(3);
    expect(release.match(/continue-on-error: true/g)).toHaveLength(3);
  });

  it("records benchmarks as not measured and keeps a local rust audit unmarked", () => {
    execFileSync("node", [resolve(root, "scripts/quality-reports.mjs")], { cwd: root });
    const status = JSON.parse(read("benchmark-results/status.json")) as { result: string };
    expect(status.result).toBe("not-measured");

    const pkg = JSON.parse(read("package.json")) as { version: string };
    const dir = mkdtempSync(join(tmpdir(), "savage-gates-"));
    const installer = join(dir, `SaVaGe_${pkg.version}_x64-setup.exe`);
    writeFileSync(installer, "unsigned-nsis-fixture");
    const args = [
      resolve(root, "scripts/release-manifest.mjs"),
      "provenance",
      "--installer",
      installer,
      "--out",
      dir,
      "--commit",
      "0123456789abcdef0123456789abcdef01234567",
      "--tag",
      `v${pkg.version}`,
      "--node",
      "24.18.0",
      "--pnpm",
      "10.17.1",
      "--rustc",
      "1.96.0",
      "--rust-audit",
      "passed",
    ];
    execFileSync("node", args, { cwd: root });
    const provenance = JSON.parse(readFileSync(join(dir, "provenance.json"), "utf8")) as {
      checks: { rustAudit: string };
      acceptanceGates: { gates: { id: string; result: string }[] };
    };
    expect(provenance.checks.rustAudit).toBe("passed");
    expect(provenance.acceptanceGates.gates.find((gate) => gate.id === "rust-audit")?.result).toBe(
      "passed",
    );
    expect(() =>
      execFileSync("node", args.slice(0, -1).concat("failed"), { cwd: root }),
    ).toThrow(/--rust-audit must be passed or not-run/);
  });
});
