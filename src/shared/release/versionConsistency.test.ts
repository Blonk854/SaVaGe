import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const script = resolve(root, "scripts/release-manifest.mjs");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function cargoPackageVersion(toml: string) {
  const block = toml.split(/^\[/m).find((section) => section.startsWith("package]"));
  return block ? /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1] ?? null : null;
}

function actionRefs(yaml: string) {
  return [...yaml.matchAll(/^\s+uses:\s+(\S+)/gm)].map((match) => match[1]);
}

describe("release version consistency", () => {
  it("keeps package, Cargo, Tauri, and user-manual versions identical", () => {
    const pkg = JSON.parse(read("package.json")) as { version: string };
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as { version: string };
    const cargo = cargoPackageVersion(read("src-tauri/Cargo.toml"));
    const manual = /matches application v(\d+\.\d+\.\d+)/.exec(read("USER_MANUAL.md"))?.[1];
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(tauri.version).toBe(pkg.version);
    expect(cargo).toBe(pkg.version);
    expect(manual).toBe(pkg.version);
    expect(execFileSync("node", [script, "check"], { encoding: "utf8", cwd: root }).trim()).toBe(
      pkg.version,
    );
  });

  it("writes checksums that match the installer bytes", () => {
    const pkg = JSON.parse(read("package.json")) as { version: string };
    const dir = mkdtempSync(join(tmpdir(), "savage-release-"));
    const installer = join(dir, `SaVaGe_${pkg.version}_x64-setup.exe`);
    writeFileSync(installer, "unsigned-nsis-fixture");
    execFileSync(
      "node",
      [
        script,
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
      ],
      { cwd: root },
    );
    const provenance = JSON.parse(readFileSync(join(dir, "provenance.json"), "utf8")) as {
      signed: boolean;
      signingPolicy: string;
      gitTag: string;
      rollout: { distribution: string; autoUpdater: boolean; unsignedMaxChannel: string };
      artifact: { fileName: string; sha256: string };
    };
    const sums = readFileSync(join(dir, "SHA256SUMS.txt"), "utf8").trim();
    expect(provenance.signed).toBe(false);
    expect(provenance.signingPolicy).toBe("unsigned-until-authenticode");
    expect(provenance.rollout).toEqual({
      distribution: "manual-reinstall",
      autoUpdater: false,
      unsignedMaxChannel: "beta",
    });
    expect(provenance.gitTag).toBe(`v${pkg.version}`);
    expect(sums).toBe(`${provenance.artifact.sha256}  ${provenance.artifact.fileName}`);
    expect(provenance.artifact.fileName).toBe(`SaVaGe_${pkg.version}_x64-setup.exe`);
  });
});

describe("release workflow pinning", () => {
  it("pins actions by SHA and keeps signing credentials off pull requests", () => {
    const release = read(".github/workflows/release.yml");
    const check = read(".github/workflows/check.yml");
    expect(release).toMatch(/tags:\s*\n\s*-\s*'v\*\.\*\.\*'/);
    expect(release).not.toMatch(/pull_request/);
    expect(release).toMatch(/environment:\s*release/);
    expect(release).toMatch(/pnpm install --frozen-lockfile/);
    expect(release).toMatch(/cargo fetch --locked --manifest-path src-tauri\/Cargo\.toml/);
    expect(check).toMatch(/pull_request/);
    expect(check).toMatch(/cron:\s*"17 8 \* \* 1"/);
    expect(check).toMatch(/pnpm audit:frontend/);
    expect(release).toMatch(/pnpm audit:frontend/);
    expect(read("scripts/release-package.ps1")).toMatch(/audit:frontend/);
    expect(read("package.json")).toMatch(/"audit:frontend": "pnpm audit --prod"/);
    expect(`${release}\n${check}`).not.toMatch(/coverageThreshold|thresholds:\s*\{/);
    expect(check).toMatch(/permissions:\s*\n\s*contents:\s*read/);
    expect(`${release}\n${check}`).not.toMatch(
      /WINDOWS_CERTIFICATE|TAURI_SIGNING|certificateThumbprint/,
    );
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      bundle?: { windows?: { certificateThumbprint?: string } };
    };
    expect(tauri.bundle?.windows?.certificateThumbprint).toBeUndefined();
    for (const ref of [...actionRefs(release), ...actionRefs(check)]) {
      if (!/@[0-9a-f]{40}$/.test(ref)) {
        throw new Error(`Release action is not SHA-pinned: ${ref}`);
      }
    }
  });
});
