import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";

export const BROWSER_APP_VERSION = "0.1.2";

export const UNSIGNED_INSTALLER_NOTICE =
  "This build is unsigned. Windows may warn that the publisher is unknown. Verify the installer SHA-256 from the tagged release provenance before installing. Authenticode signing is required before a broad stable release.";

export const CHANNEL_NOTICE =
  "This is an internal or opt-in tagged build, not a stable channel release. There is no automatic updater. Install a later tagged setup to update.";

export function aboutText(version: string): string {
  return `SaVaGe ${version}\n\n${UNSIGNED_INSTALLER_NOTICE}\n\n${CHANNEL_NOTICE}`;
}

type VersionReader = () => Promise<string>;
type MessageFn = (text: string, options: { title: string; kind: "info" }) => Promise<unknown>;

export async function showAbout(
  readVersion: VersionReader = async () => (isTauri() ? getVersion() : BROWSER_APP_VERSION),
  present: MessageFn = (text, options) =>
    isTauri() ? message(text, options) : Promise.resolve(window.alert(text)),
): Promise<void> {
  await present(aboutText(await readVersion()), { title: "About SaVaGe", kind: "info" });
}
