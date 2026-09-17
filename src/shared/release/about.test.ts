import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aboutText,
  BROWSER_APP_VERSION,
  CHANNEL_NOTICE,
  showAbout,
  UNSIGNED_INSTALLER_NOTICE,
} from "./about";

const root = resolve(__dirname, "../../..");

describe("about", () => {
  it("uses the package version and states that the installer is unsigned", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };
    expect(BROWSER_APP_VERSION).toBe(pkg.version);
    expect(aboutText(pkg.version)).toContain(`SaVaGe ${pkg.version}`);
    expect(aboutText(pkg.version)).toContain(UNSIGNED_INSTALLER_NOTICE);
    expect(aboutText(pkg.version)).toContain(CHANNEL_NOTICE);
    expect(UNSIGNED_INSTALLER_NOTICE).toMatch(/unsigned/i);
    expect(UNSIGNED_INSTALLER_NOTICE).toMatch(/SHA-256/);
    expect(CHANNEL_NOTICE).toMatch(/no automatic updater/i);
    expect(CHANNEL_NOTICE).toMatch(/not a stable channel/i);
  });

  it("shows About only after reading the application version", async () => {
    const shown: string[] = [];
    await showAbout(
      async () => "0.1.0",
      async (text, options) => {
        shown.push(`${options.title}:${text}`);
      },
    );
    expect(shown).toEqual([`About SaVaGe:${aboutText("0.1.0")}`]);
  });
});
