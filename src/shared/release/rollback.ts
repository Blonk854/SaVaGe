import { parseVerifiedInstallerRegistry, type VerifiedInstaller } from "./halt";
import { PROJECT_SCHEMA_VERSION } from "../document/parseSavage";

export interface RollbackPolicy {
  policyVersion: number;
  binaryDowngradeIsDocumentRollback: false;
  retainAppData: true;
  identifier: string;
  allowDowngrades: true;
  compatibleOriginals: string[];
  newerWork: {
    project: string;
    recovery: string;
    reader: "unsupported";
    onOpen: "leave-in-place";
    compatibleExport: string;
  };
  forbidden: string[];
}

export type NewerWorkAction = "open-compatible" | "leave-in-place";

export function parseRollbackPolicy(value: unknown): RollbackPolicy {
  if (!value || typeof value !== "object") {
    throw new Error("Rollback policy is missing");
  }
  const policy = value as RollbackPolicy;
  if (policy.policyVersion !== 1) {
    throw new Error("Unsupported rollback policy version");
  }
  if (policy.binaryDowngradeIsDocumentRollback !== false) {
    throw new Error("A binary downgrade is not document rollback");
  }
  if (policy.retainAppData !== true || policy.allowDowngrades !== true) {
    throw new Error("Rollback must reinstall the prior NSIS while retaining app data");
  }
  if (policy.newerWork?.onOpen !== "leave-in-place") {
    throw new Error("Newer-format files must be left in place");
  }
  if (!/Save As/i.test(policy.newerWork.compatibleExport)) {
    throw new Error("Newer work needs an explicit compatible export from a newer writer");
  }
  return policy;
}

export function newerWorkAction(fileSchema: number, readerSchema = PROJECT_SCHEMA_VERSION): NewerWorkAction {
  if (fileSchema === readerSchema) return "open-compatible";
  return "leave-in-place";
}

export interface RollbackRehearsalPlan {
  binaryDowngradeIsDocumentRollback: false;
  priorInstaller: VerifiedInstaller | null;
  liveNsisBlocked: boolean;
  compatibleOriginals: string[];
  newerWork: RollbackPolicy["newerWork"];
  notes: string;
}

export function planRollbackRehearsal(options: {
  policy: unknown;
  registry: unknown;
  currentVersion: string;
}): RollbackRehearsalPlan {
  const policy = parseRollbackPolicy(options.policy);
  const prior = parseVerifiedInstallerRegistry(options.registry).installers.filter(
    (installer) => installer.version !== options.currentVersion,
  );
  const priorInstaller = prior.at(-1) ?? null;
  const liveNsisBlocked = priorInstaller === null;
  const notes = liveNsisBlocked
    ? `No prior verified installer is recorded for ${options.currentVersion}. Document leave-in-place still applies. Do not invent a previous NSIS or coerce newer files.`
    : `Close SaVaGe.exe, run ${priorInstaller.gitTag} (${priorInstaller.sha256}) with Delete the application data unchecked, then open copies of compatible originals. Leave newer-format files and recovery in place.`;
  return {
    binaryDowngradeIsDocumentRollback: false,
    priorInstaller,
    liveNsisBlocked,
    compatibleOriginals: [...policy.compatibleOriginals],
    newerWork: policy.newerWork,
    notes,
  };
}
