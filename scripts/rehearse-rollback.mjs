#!/usr/bin/env node
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function buildRollbackRehearsal(root = REPO_ROOT) {
  const policy = readJson(join(root, "docs/engineering/rollback-policy.json"));
  const registry = readJson(join(root, "docs/engineering/verified-installers.json"));
  const version = readJson(join(root, "package.json")).version;
  const prior = (registry.installers ?? []).filter((item) => item.version !== version).at(-1) ?? null;
  const dir = mkdtempSync(join(tmpdir(), "savage-rollback-"));
  const copies = [...policy.compatibleOriginals, policy.newerWork.project, policy.newerWork.recovery].map(
    (relative) => {
      const dest = join(dir, basename(relative));
      copyFileSync(join(root, relative), dest);
      return { relative, dest, bytes: readFileSync(dest) };
    },
  );
  return {
    version,
    binaryDowngradeIsDocumentRollback: policy.binaryDowngradeIsDocumentRollback,
    priorInstaller: prior,
    liveNsisBlocked: prior === null,
    rehearsalDirectory: dir,
    copies: copies.map((copy) => ({ relative: copy.relative, dest: copy.dest, bytes: copy.bytes.length })),
    notes:
      prior === null
        ? `No prior verified installer for ${version}. Open copies of schema 1 originals. Leave newer-format files and recovery unchanged. Do not run an invented NSIS.`
        : `Close SaVaGe.exe. Run ${prior.gitTag} (${prior.sha256}). Leave Delete the application data unchecked. Open copies of compatible originals. Do not overwrite newer files.`,
  };
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(buildRollbackRehearsal(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
