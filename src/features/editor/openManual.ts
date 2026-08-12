import { resolveResource } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-shell";

/** Open the bundled SaVaGe user manual PDF in the system viewer. */
export async function openUserManual(): Promise<void> {
  const candidates = [
    "resources/USER_MANUAL.pdf",
    "USER_MANUAL.pdf",
  ];

  let lastError: unknown;
  for (const rel of candidates) {
    try {
      const path = await resolveResource(rel);
      await open(path);
      return;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not find USER_MANUAL.pdf");
}
