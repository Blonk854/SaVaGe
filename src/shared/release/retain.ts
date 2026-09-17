import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseVerifiedInstallerRegistry,
  type VerifiedInstaller,
  type VerifiedInstallerRegistry,
} from "./halt";

export interface InstallerCatalog extends VerifiedInstallerRegistry {
  distribution: "manual-reinstall";
  autoUpdater: false;
  retainPrevious: true;
  archive: string;
  compatibilityNotes: string[];
}

export function installerFileName(version: string): string {
  return `SaVaGe_${version}_x64-setup.exe`;
}

export function parseInstallerCatalog(value: unknown): InstallerCatalog {
  parseVerifiedInstallerRegistry(value);
  if (!value || typeof value !== "object") {
    throw new Error("Installer catalog is missing");
  }
  const catalog = value as InstallerCatalog;
  if (catalog.autoUpdater !== false) {
    throw new Error("Automatic updater is not part of this release");
  }
  if (catalog.distribution !== "manual-reinstall") {
    throw new Error("Prior installers are offered by manual reinstall only");
  }
  if (catalog.retainPrevious !== true) {
    throw new Error("Previous verified installers must be retained");
  }
  if (!Array.isArray(catalog.compatibilityNotes) || catalog.compatibilityNotes.length === 0) {
    throw new Error("Compatibility notes must stay listed with the catalog");
  }
  return catalog;
}

export function assertCompatibilityNotesExist(catalog: InstallerCatalog, root: string): void {
  for (const relative of catalog.compatibilityNotes) {
    if (!existsSync(resolve(root, relative))) {
      throw new Error(`Compatibility notes missing: ${relative}`);
    }
  }
}

export function retainVerifiedInstaller(
  catalog: InstallerCatalog,
  entry: VerifiedInstaller,
): InstallerCatalog {
  const existing = catalog.installers.find((installer) => installer.gitTag === entry.gitTag);
  if (existing) {
    if (existing.sha256 !== entry.sha256) {
      throw new Error(`Refusing to replace retained ${entry.gitTag} with different bytes`);
    }
    return catalog;
  }
  return {
    ...catalog,
    installers: [...catalog.installers, entry],
  };
}
