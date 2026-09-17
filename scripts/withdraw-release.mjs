#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const HALT_TRIGGERS = [
  "confirmed-corruption",
  "missing-recovery",
  "critical-security",
  "failed-install",
];

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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function versionFromTag(tag) {
  const match = /^v(\d+\.\d+\.\d+)$/.exec(String(tag ?? "").trim());
  if (!match) {
    throw new Error(`Withdraw requires a vX.Y.Z tag, got ${tag || "<empty>"}`);
  }
  return match[1];
}

export function buildWithdrawPlan({ tag, trigger, root = REPO_ROOT }) {
  if (!HALT_TRIGGERS.includes(trigger)) {
    throw new Error(
      `Withdraw requires a halt trigger: ${HALT_TRIGGERS.join(", ")}`,
    );
  }
  const policy = readJson(join(root, "docs/engineering/rollout-policy.json"));
  const registry = readJson(join(root, "docs/engineering/verified-installers.json"));
  const version = versionFromTag(tag);
  const prior = (registry.installers ?? []).filter((item) => item.version !== version).at(-1) ?? null;
  const priorLine = prior
    ? `Offer the prior verified installer ${prior.gitTag} (SHA-256 ${prior.sha256}).`
    : "No prior verified installer is recorded. Do not invent one. Keep user files and wait for a replacement tag.";
  return {
    halt: true,
    trigger,
    tag,
    version,
    github: {
      command: [
        "gh",
        "release",
        "edit",
        tag,
        "--draft",
        "--prerelease",
        "--notes-file",
      ],
      deleteRelease: false,
      deleteTag: false,
    },
    preserve: {
      documents: true,
      recovery: true,
      diagnosticsConsentRequired: true,
    },
    offerPrior: prior,
    forbidden: policy.halt.withdraw.forbidden,
    notes: [
      `WITHDRAWN: SaVaGe ${version} (${tag}). Halt trigger: ${trigger}.`,
      "Stop promotion. Do not mark this GitHub Release as latest stable.",
      "Keep user .savage files and crash-recovery snapshots. Do not uninstall with Delete the application data.",
      "Collect diagnostics only if the user confirms Help → Export Diagnostics. Nothing is uploaded automatically.",
      priorLine,
      "A binary downgrade is not document rollback. Do not overwrite or delete newer-format files.",
    ].join("\n"),
  };
}

function commandPlan(args, root) {
  const plan = buildWithdrawPlan({
    tag: String(args.tag ?? ""),
    trigger: String(args.reason ?? args.trigger ?? ""),
    root,
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

function commandApply(args, root) {
  const plan = commandPlan(args, root);
  if (!existsSync(join(root, ".git"))) {
    throw new Error("Apply requires the SaVaGe git repository");
  }
  const notesDir = mkdtempSync(join(tmpdir(), "savage-withdraw-"));
  const notesPath = join(notesDir, `${plan.tag}-notes.txt`);
  writeFileSync(notesPath, `${plan.notes}\n`);
  const result = spawnSync(
    "gh",
    ["release", "edit", plan.tag, "--draft", "--prerelease", "--notes-file", notesPath],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "gh release edit failed");
  }
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const command = args._[0] ?? "plan";
    if (command === "plan") commandPlan(args, REPO_ROOT);
    else if (command === "apply") commandApply(args, REPO_ROOT);
    else throw new Error(`Unknown command ${command}`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
