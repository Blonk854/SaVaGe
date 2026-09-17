export const ROLLOUT_CHANNELS = ["internal", "beta", "stable"] as const;
export type RolloutChannel = (typeof ROLLOUT_CHANNELS)[number];

export interface RolloutPolicy {
  policyVersion: number;
  distribution: "manual-reinstall";
  autoUpdater: false;
  percentageRollout: false;
  channels: RolloutChannel[];
  unsignedMaxChannel: Exclude<RolloutChannel, "stable">;
  internal: {
    name: string;
    population: string;
    corpus: string[];
    faultTests: string[];
  };
  beta: {
    population: string;
    minimumTesters: number;
    feedbackIntervalDays: number;
    feedback: string;
    exitCriteria: string[];
  };
  stable: {
    requires: string[];
  };
  halt: {
    triggers: string[];
    preserve: string[];
    diagnostics: string;
    withdraw: {
      github: string;
      notify: string;
      offerPrior: string;
      forbidden: string[];
    };
  };
}

export function parseRolloutPolicy(value: unknown): RolloutPolicy {
  if (!value || typeof value !== "object") {
    throw new Error("Rollout policy is missing");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.policyVersion !== 1) {
    throw new Error("Unsupported rollout policy version");
  }
  if (candidate.autoUpdater !== false) {
    throw new Error("Automatic updater is not part of this release");
  }
  if (candidate.percentageRollout !== false) {
    throw new Error("Percentage rollout is not supported without distribution infrastructure");
  }
  if (candidate.distribution !== "manual-reinstall") {
    throw new Error("Rollout is manual reinstall of a tagged NSIS artifact");
  }
  if (candidate.unsignedMaxChannel === "stable") {
    throw new Error("Unsigned builds cannot be stable");
  }
  const policy = value as RolloutPolicy;
  if (policy.beta.minimumTesters < 2) {
    throw new Error("Beta requires at least two named testers");
  }
  if (policy.beta.feedbackIntervalDays < 7) {
    throw new Error("Beta feedback interval must be at least 7 days");
  }
  if (!policy.beta.exitCriteria.some((item) => /gate review/i.test(item))) {
    throw new Error("Beta exit criteria must include an explicit gate review");
  }
  if (!policy.halt?.triggers?.length || !policy.halt.withdraw?.forbidden?.length) {
    throw new Error("Halt and withdraw procedure is missing");
  }
  return policy;
}

export function maxChannelForSignature(signed: boolean): RolloutChannel {
  return signed ? "stable" : "beta";
}
