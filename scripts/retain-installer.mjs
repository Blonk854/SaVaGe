#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CATALOG_PATH = join(REPO_ROOT, "docs/engineering/verified-installers.json");

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

function readCatalog() {
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function retainEntry(catalog, entry) {
  const existing = (catalog.installers ?? []).find((item) => item.gitTag === entry.gitTag);
  if (existing) {
    if (existing.sha256 !== entry.sha256) {
      throw new Error(`Refusing to replace retained ${entry.gitTag} with different bytes`);
    }
    return catalog;
  }
  return { ...catalog, installers: [...(catalog.installers ?? []), entry] };
}

function commandList() {
  const catalog = readCatalog();
  if (catalog.autoUpdater !== false || catalog.retainPrevious !== true) {
    throw new Error("Catalog must retain previous installers without an automatic updater");
  }
  process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
}

function commandRecord(args) {
  const installer = resolve(String(args.installer ?? ""));
  if (!args.installer || !existsSync(installer)) {
    throw new Error("record requires --installer <SaVaGe_<version>_x64-setup.exe>");
  }
  const dir = dirname(installer);
  const provenancePath = join(dir, "provenance.json");
  const sumsPath = join(dir, "SHA256SUMS.txt");
  if (!existsSync(provenancePath) || !existsSync(sumsPath)) {
    throw new Error("record requires provenance.json and SHA256SUMS.txt next to the installer");
  }
  const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
  const sha256 = sha256File(installer);
  if (provenance.artifact?.sha256 !== sha256) {
    throw new Error("Installer SHA-256 does not match provenance.json");
  }
  const fileName = installer.split(/[/\\]/).pop();
  if (fileName !== provenance.artifact.fileName) {
    throw new Error(`Installer name ${fileName} does not match provenance`);
  }
  const entry = {
    version: provenance.version,
    gitTag: provenance.gitTag,
    sha256,
    fileName,
    verified: true,
    compatibilityNotes: "docs/engineering/m8-compatibility.md",
  };
  const next = retainEntry(readCatalog(), entry);
  writeFileSync(CATALOG_PATH, `${JSON.stringify(next, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const command = args._[0] ?? "list";
    if (command === "list") commandList();
    else if (command === "record") commandRecord(args);
    else throw new Error(`Unknown command ${command}`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
