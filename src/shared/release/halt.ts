import { parseRolloutPolicy, type RolloutPolicy } from "./rolloutPolicy";

export const HALT_TRIGGERS = [
  "confirmed-corruption",
  "missing-recovery",
  "critical-security",
  "failed-install",
] as const;

export type HaltTrigger = (typeof HALT_TRIGGERS)[number];

export interface VerifiedInstaller {
  version: string;
  gitTag: string;
  sha256: string;
  verified: true;
}

export interface VerifiedInstallerRegistry {
  policyVersion: number;
  installers: VerifiedInstaller[];
}

export interface WithdrawPlan {
  halt: true;
  trigger: HaltTrigger;
  tag: string;
  version: string;
  github: {
    draft: true;
    prerelease: true;
    deleteRelease: false;
    deleteTag: false;
  };
  preserve: {
    documents: true;
    recovery: true;
    diagnosticsConsentRequired: true;
  };
  offerPrior: VerifiedInstaller | null;
  forbidden: string[];
  notes: string;
}

export function assertHaltPolicy(policy: RolloutPolicy): void {
  const triggers = policy.halt.triggers;
  for (const required of HALT_TRIGGERS) {
    if (!triggers.includes(required)) {
      throw new Error(`Halt policy missing trigger ${required}`);
    }
  }
  const forbidden = policy.halt.withdraw.forbidden.join("\n");
  if (!/gh release delete/i.test(forbidden) || !/git tag -d/i.test(forbidden)) {
    throw new Error("Halt policy must forbid deleting the GitHub release and git tag");
  }
}

export function parseVerifiedInstallerRegistry(value: unknown): VerifiedInstallerRegistry {
  if (!value || typeof value !== "object") {
    throw new Error("Verified installer registry is missing");
  }
  const registry = value as VerifiedInstallerRegistry;
  if (registry.policyVersion !== 1) {
    throw new Error("Unsupported verified installer registry version");
  }
  if (!Array.isArray(registry.installers)) {
    throw new Error("Verified installer list is missing");
  }
  for (const installer of registry.installers) {
    if (!installer?.verified || !installer.version || !installer.gitTag || !installer.sha256) {
      throw new Error("Verified installer entries must include version, gitTag, sha256, and verified: true");
    }
  }
  return registry;
}

export function resolvePriorVerifiedInstaller(
  registry: VerifiedInstallerRegistry,
  withdrawnVersion: string,
): VerifiedInstaller | null {
  const prior = registry.installers.filter((installer) => installer.version !== withdrawnVersion);
  return prior.at(-1) ?? null;
}

export function versionFromTag(tag: string): string {
  const match = /^v(\d+\.\d+\.\d+)$/.exec(tag.trim());
  if (!match) {
    throw new Error(`Withdraw requires a vX.Y.Z tag, got ${tag || "<empty>"}`);
  }
  return match[1];
}

export function planWithdraw(options: {
  tag: string;
  trigger: HaltTrigger;
  policy: unknown;
  registry: unknown;
}): WithdrawPlan {
  if (!HALT_TRIGGERS.includes(options.trigger)) {
    throw new Error("Withdraw requires a recorded halt trigger");
  }
  const policy = parseRolloutPolicy(options.policy);
  assertHaltPolicy(policy);
  const version = versionFromTag(options.tag);
  const offerPrior = resolvePriorVerifiedInstaller(
    parseVerifiedInstallerRegistry(options.registry),
    version,
  );
  const priorLine = offerPrior
    ? `Offer the prior verified installer ${offerPrior.gitTag} (SHA-256 ${offerPrior.sha256}).`
    : "No prior verified installer is recorded. Do not invent one. Keep user files and wait for a replacement tag.";
  return {
    halt: true,
    trigger: options.trigger,
    tag: options.tag,
    version,
    github: {
      draft: true,
      prerelease: true,
      deleteRelease: false,
      deleteTag: false,
    },
    preserve: {
      documents: true,
      recovery: true,
      diagnosticsConsentRequired: true,
    },
    offerPrior,
    forbidden: [...policy.halt.withdraw.forbidden],
    notes: [
      `WITHDRAWN: SaVaGe ${version} (${options.tag}). Halt trigger: ${options.trigger}.`,
      "Stop promotion. Do not mark this GitHub Release as latest stable.",
      "Keep user .savage files and crash-recovery snapshots. Do not uninstall with Delete the application data.",
      "Collect diagnostics only if the user confirms Help → Export Diagnostics. Nothing is uploaded automatically.",
      priorLine,
      "A binary downgrade is not document rollback. Do not overwrite or delete newer-format files.",
    ].join("\n"),
  };
}
