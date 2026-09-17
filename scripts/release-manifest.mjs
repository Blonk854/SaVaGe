#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..");

export function cargoPackageVersion(toml) {
  const block = toml.split(/^\[/m).find((section) => section.startsWith("package]"));
  return block ? /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1] ?? null : null;
}

export function manualApplicationVersion(markdown) {
  return /matches application v(\d+\.\d+\.\d+)/.exec(markdown)?.[1] ?? null;
}

export function readManifestVersions(root = REPO_ROOT) {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const tauriConf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
  const cargoToml = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8");
  const userManual = readFileSync(join(root, "USER_MANUAL.md"), "utf8");
  return {
    package: packageJson.version,
    tauri: tauriConf.version,
    cargo: cargoPackageVersion(cargoToml),
    manual: manualApplicationVersion(userManual),
  };
}

export function consistentVersion(versions) {
  const values = Object.values(versions);
  if (values.some((value) => !value) || new Set(values).size !== 1) {
    const detail = Object.entries(versions)
      .map(([name, value]) => `${name}=${value ?? "<missing>"}`)
      .join(", ");
    throw new Error(`Application versions are not consistent: ${detail}`);
  }
  return values[0];
}

export function expectedInstallerName(version) {
  return `SaVaGe_${version}_x64-setup.exe`;
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        i += 1;
      }
    } else args._.push(token);
  }
  return args;
}

function lockfileHashes(root) {
  return {
    "pnpm-lock.yaml": sha256File(join(root, "pnpm-lock.yaml")),
    "src-tauri/Cargo.lock": sha256File(join(root, "src-tauri/Cargo.lock")),
  };
}

export function buildProvenance({
  version,
  gitCommit,
  gitTag,
  installerPath,
  signed = false,
  toolchain,
  checks,
  createdAt = new Date().toISOString(),
  root = REPO_ROOT,
}) {
  const fileName = expectedInstallerName(version);
  const actualName = installerPath.split(/[/\\]/).pop();
  if (actualName !== fileName) {
    throw new Error(`Installer name ${actualName} does not match ${fileName}`);
  }
  return {
    product: "SaVaGe",
    version,
    gitCommit,
    gitTag,
    signed,
    signingPolicy: "unsigned-until-authenticode",
    rollout: {
      distribution: "manual-reinstall",
      autoUpdater: false,
      unsignedMaxChannel: "beta",
    },
    createdAt,
    toolchain,
    lockfiles: lockfileHashes(root),
    checks,
    artifact: {
      fileName,
      sha256: sha256File(installerPath),
    },
  };
}

function commandCheck(root) {
  const version = consistentVersion(readManifestVersions(root));
  process.stdout.write(`${version}\n`);
}

function commandProvenance(args, root) {
  const version = consistentVersion(readManifestVersions(root));
  const installer = resolve(String(args.installer ?? ""));
  if (!args.installer || !existsSync(installer)) {
    throw new Error("provenance requires --installer <nsis-setup.exe>");
  }
  const expectedTag = `v${version}`;
  const gitTag = args.tag ? String(args.tag) : process.env.GITHUB_REF_NAME ?? "";
  if (!args["skip-tag"] && gitTag !== expectedTag) {
    throw new Error(`Git tag ${gitTag || "<none>"} does not match ${expectedTag}`);
  }
  const outDir = resolve(String(args.out ?? dirname(installer)));
  const provenance = buildProvenance({
    version,
    gitCommit: String(args.commit ?? process.env.GITHUB_SHA ?? ""),
    gitTag: gitTag || expectedTag,
    installerPath: installer,
    toolchain: {
      node: String(args.node ?? process.version.replace(/^v/, "")),
      pnpm: String(args.pnpm ?? ""),
      rustc: String(args.rustc ?? ""),
    },
    checks: {
      versionConsistency: "passed",
      frontend: String(args["checks-frontend"] ?? "passed"),
      rust: String(args["checks-rust"] ?? "passed"),
    },
  });
  if (!provenance.gitCommit) {
    throw new Error("provenance requires --commit or GITHUB_SHA");
  }
  const sumsPath = join(outDir, "SHA256SUMS.txt");
  const provenancePath = join(outDir, "provenance.json");
  writeFileSync(sumsPath, `${provenance.artifact.sha256}  ${provenance.artifact.fileName}\n`);
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  process.stdout.write(`${provenancePath}\n`);
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const command = args._[0] ?? "check";
    if (command === "check" || command === "version") commandCheck(REPO_ROOT);
    else if (command === "provenance") commandProvenance(args, REPO_ROOT);
    else throw new Error(`Unknown command ${command}`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
