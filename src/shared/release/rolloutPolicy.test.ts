import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { maxChannelForSignature, parseRolloutPolicy, ROLLOUT_CHANNELS } from "./rolloutPolicy";

const root = resolve(__dirname, "../../..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("rollout policy", () => {
  it("forbids automatic updates and percentage rollouts", () => {
    const policy = parseRolloutPolicy(
      JSON.parse(read("docs/engineering/rollout-policy.json")),
    );
    expect(policy.channels).toEqual([...ROLLOUT_CHANNELS]);
    expect(policy.autoUpdater).toBe(false);
    expect(policy.percentageRollout).toBe(false);
    expect(policy.distribution).toBe("manual-reinstall");
    expect(policy.unsignedMaxChannel).toBe("beta");
    expect(policy.beta.minimumTesters).toBeGreaterThanOrEqual(2);
    expect(policy.beta.feedbackIntervalDays).toBeGreaterThanOrEqual(7);
    expect(maxChannelForSignature(false)).toBe("beta");
    expect(maxChannelForSignature(true)).toBe("stable");
    for (const path of [...policy.internal.corpus, ...policy.internal.faultTests]) {
      expect(existsSync(resolve(root, path)), path).toBe(true);
    }
  });

  it("rejects updater, percentage, and unsigned-stable policies", () => {
    const base = JSON.parse(read("docs/engineering/rollout-policy.json")) as Record<string, unknown>;
    expect(() => parseRolloutPolicy({ ...base, autoUpdater: true })).toThrow(/automatic updater/i);
    expect(() => parseRolloutPolicy({ ...base, percentageRollout: true })).toThrow(/Percentage rollout/i);
    expect(() => parseRolloutPolicy({ ...base, unsignedMaxChannel: "stable" })).toThrow(/cannot be stable/i);
    expect(() =>
      parseRolloutPolicy({
        ...base,
        beta: { ...(base.beta as object), minimumTesters: 1, feedbackIntervalDays: 7, exitCriteria: ["gate review"] },
      }),
    ).toThrow(/two named testers/i);
  });

  it("keeps the tagged NSIS workflow as a prerelease without an updater plugin", () => {
    const release = read(".github/workflows/release.yml");
    const cargo = read("src-tauri/Cargo.toml");
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      plugins?: unknown;
      bundle?: { createUpdaterArtifacts?: boolean };
    };
    expect(release).toMatch(/--prerelease/);
    expect(release).toMatch(/tags:\s*\n\s*-\s*'v\*\.\*\.\*'/);
    expect(release).toMatch(/no automatic updater/i);
    expect(release).not.toMatch(/percentage rollout/i);
    expect(read("USER_MANUAL.md")).toMatch(/no automatic updater/i);
    expect(cargo).not.toMatch(/tauri-plugin-updater/);
    expect(pkg.dependencies?.["@tauri-apps/plugin-updater"]).toBeUndefined();
    expect(tauri.plugins).toBeUndefined();
    expect(tauri.bundle?.createUpdaterArtifacts).toBeFalsy();
  });

  it("records v0.1.0 as internal and unsigned so it cannot be stable", () => {
    const record = read("docs/engineering/promotion-records/v0.1.0.md");
    expect(record).toMatch(/Unsigned:\s+\*\*yes\*\*/);
    expect(record).toMatch(/\*\*internal\*\*/);
    expect(record).toMatch(/cannot be marked stable/);
  });
});
