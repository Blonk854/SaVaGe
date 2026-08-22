import { invoke } from "@tauri-apps/api/core";

/** Open the bundled SaVaGe user manual PDF in the system viewer. */
export async function openUserManual(): Promise<void> {
  await invoke("open_user_manual");
}
