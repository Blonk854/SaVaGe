/**
 * In-memory stand-in for the Tauri command surface.
 * Journey tests install it with `vi.mock`. Production never imports it, so a
 * browser run cannot report a successful native save.
 */

export interface BrowserOpenSource {
  path: string;
  imageGrantId?: string | null;
  projectDestinationGrantId?: string | null;
}

export interface BrowserFileRecord {
  contents: string;
  size: number;
  modifiedMs: number;
}

export interface BrowserRecoveryCandidate {
  sessionId: string;
  sourcePath: string | null;
  sequence: number;
  contents: string;
  createdAtMs: number;
  originalRelation?: string;
}

type CloseHandler = (event: { preventDefault: () => void }) => void | Promise<void>;

const TRACE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect data-name="Traced mark" x="4" y="6" width="20" height="12" fill="#b8ff3c"/></svg>`;

const PREVIEW = {
  dataUrl: "data:image/png;base64,aaaa",
  width: 32,
  height: 16,
  byteSize: 128,
  format: "png",
};

class BrowserNative {
  tauri = false;
  files = new Map<string, BrowserFileRecord>();
  grants = new Map<string, string>();
  nextOpen: BrowserOpenSource | null = null;
  savePath: string | null = "C:\\projects\\journey.savage";
  imagePath = "C:\\images\\mark.png";
  exportSvgPath: string | null = "C:\\projects\\journey.svg";
  exportPngPath: string | null = "C:\\projects\\journey.png";
  recoveries: BrowserRecoveryCandidate[] = [];
  recoveryIssues: { fileName: string; reason: string }[] = [];
  dialogQueue: Array<string | boolean> = [];
  conflictWrites = 0;
  readError: string | null = null;
  previewError: string | null = null;
  convertError: string | null = null;
  reopenLastProject = false;
  recentProjects: Array<{
    id: string;
    displayName: string;
    parentLabel: string;
    openedAtMs: number;
  }> = [];
  exports: Array<{ kind: string; path: string; contents: string }> = [];
  deletedRecoveries: Array<{ sessionId: string; throughSequence: number }> = [];
  exited = false;
  closeHandler: CloseHandler | null = null;
  private grantSerial = 0;
  private gates = new Map<string, { promise: Promise<void>; release: () => void }>();

  reset(): void {
    this.releaseAll();
    this.tauri = false;
    this.files.clear();
    this.grants.clear();
    this.nextOpen = null;
    this.savePath = "C:\\projects\\journey.savage";
    this.imagePath = "C:\\images\\mark.png";
    this.exportSvgPath = "C:\\projects\\journey.svg";
    this.exportPngPath = "C:\\projects\\journey.png";
    this.recoveries = [];
    this.recoveryIssues = [];
    this.dialogQueue = [];
    this.conflictWrites = 0;
    this.readError = null;
    this.previewError = null;
    this.convertError = null;
    this.reopenLastProject = false;
    this.recentProjects = [];
    this.exports = [];
    this.deletedRecoveries = [];
    this.exited = false;
    this.closeHandler = null;
    this.grantSerial = 0;
  }

  hold(command: string): void {
    let release: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.gates.set(command, { promise, release });
  }

  release(command: string): void {
    const gate = this.gates.get(command);
    this.gates.delete(command);
    gate?.release();
  }

  releaseAll(): void {
    for (const command of [...this.gates.keys()]) this.release(command);
  }

  seedFile(path: string, contents: string): void {
    this.files.set(path, this.record(contents));
  }

  queueOpen(source: BrowserOpenSource): void {
    this.nextOpen = source;
  }

  requestClose(): Promise<void> {
    const handler = this.closeHandler;
    if (!handler) throw new Error("Window close was not registered");
    return Promise.resolve(handler({ preventDefault() {} }));
  }

  async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const gate = this.gates.get(command);
    if (gate) await gate.promise;

    switch (command) {
      case "pick_open_source":
        return this.nextOpen;
      case "pick_image_source":
      case "claim_dropped_image":
        return { path: this.imagePath, grantId: this.grantFor(this.imagePath) };
      case "pick_project_destination":
        return this.destination(this.savePath);
      case "pick_svg_destination":
        return this.destination(this.exportSvgPath);
      case "pick_png_destination":
        return this.destination(this.exportPngPath);
      case "read_text_file":
        return this.readPath(String(args.path ?? ""));
      case "read_project_file":
        return this.readGrant(String(args.destinationGrantId ?? ""));
      case "write_project_file":
        return this.writeProject(args);
      case "remember_open_project":
        this.remember(String(args.destinationGrantId ?? ""));
        return null;
      case "list_recent_projects":
        return { reopenLastProject: this.reopenLastProject, projects: this.recentProjects };
      case "set_reopen_last_project":
        this.reopenLastProject = Boolean(args.enabled);
        return this.reopenLastProject;
      case "reopen_recent_project":
      case "startup_recent_project":
        return null;
      case "read_image_preview":
        if (this.previewError) throw new Error(this.previewError);
        return PREVIEW;
      case "convert_image_to_svg":
        return this.convert(args.request);
      case "cancel_convert_job":
      case "cancel_export_job":
        return { jobId: (args.jobId as string) ?? "", state: "cancelRequested" };
      case "retire_convert_source":
        return null;
      case "write_svg_export":
        return this.finishExport("svg", args.request);
      case "export_png":
        return this.finishExport("png", args.request);
      case "list_recoveries":
        return { candidates: this.recoveries, issues: this.recoveryIssues };
      case "write_recovery":
        return null;
      case "delete_recovery":
        this.deletedRecoveries.push({
          sessionId: String(args.sessionId ?? ""),
          throughSequence: Number(args.throughSequence ?? 0),
        });
        return true;
      case "exit_application":
        this.exited = true;
        return null;
      case "record_diagnostic":
      case "open_user_manual":
        return null;
      default:
        throw new Error(`Browser adapter has no command ${command}`);
    }
  }

  private destination(path: string | null): { path: string; grantId: string } | null {
    if (!path) return null;
    return { path, grantId: this.grantFor(path) };
  }

  private grantFor(path: string): string {
    for (const [grantId, grantedPath] of this.grants) {
      if (grantedPath === path) return grantId;
    }
    this.grantSerial += 1;
    const grantId = `grant-${this.grantSerial}`;
    this.grants.set(grantId, path);
    return grantId;
  }

  private record(contents: string): BrowserFileRecord {
    return { contents, size: contents.length, modifiedMs: 1_700_000_000_000 };
  }

  private readPath(path: string): { contents: string; fingerprint: { size: number; modifiedMs: number } } {
    if (this.readError) {
      const message = this.readError;
      this.readError = null;
      throw new Error(message);
    }
    const file = this.files.get(path);
    if (!file) throw new Error("File not found");
    return {
      contents: file.contents,
      fingerprint: { size: file.size, modifiedMs: file.modifiedMs },
    };
  }

  private readGrant(grantId: string) {
    const path = this.grants.get(grantId);
    if (!path) throw new Error("Unknown destination grant");
    return this.readPath(path);
  }

  private writeProject(args: Record<string, unknown>): { size: number; modifiedMs: number } {
    const grantId = String(args.destinationGrantId ?? "");
    const path = this.grants.get(grantId);
    if (!path) throw new Error("Unknown destination grant");
    if (args.expectedFingerprint && this.conflictWrites > 0) {
      this.conflictWrites -= 1;
      throw new Error("conflict: destination changed since it was opened or saved");
    }
    const contents = String(args.contents ?? "");
    const file = this.record(contents);
    this.files.set(path, file);
    return { size: file.size, modifiedMs: file.modifiedMs };
  }

  private remember(grantId: string): void {
    const path = this.grants.get(grantId);
    if (!path) return;
    const displayName = path.split(/[/\\]/).pop()?.replace(/\.savage$/i, "") || "Untitled";
    this.recentProjects = [
      { id: grantId, displayName, parentLabel: "projects", openedAtMs: 1_700_000_000_000 },
      ...this.recentProjects.filter((project) => project.id !== grantId),
    ].slice(0, 10);
  }

  private convert(request: unknown) {
    if (!request || typeof request !== "object") {
      throw new Error("Native conversion returned a stale or invalid result");
    }
    const job = request as { jobId?: unknown; sessionId?: unknown; sourceRevision?: unknown };
    if (this.convertError) throw new Error(this.convertError);
    return {
      jobId: job.jobId,
      sessionId: job.sessionId,
      sourceRevision: job.sourceRevision,
      svg: TRACE_SVG,
    };
  }

  private finishExport(kind: string, request: unknown) {
    if (!request || typeof request !== "object") {
      throw new Error("Native export returned a stale or invalid result");
    }
    const job = request as {
      jobId?: unknown;
      sessionId?: unknown;
      sourceRevision?: unknown;
      destinationGrantId?: unknown;
      contents?: unknown;
    };
    const path = this.grants.get(String(job.destinationGrantId ?? ""));
    if (!path) throw new Error("Unknown destination grant");
    this.exports.push({ kind, path, contents: String(job.contents ?? "") });
    return {
      jobId: job.jobId,
      sessionId: job.sessionId,
      sourceRevision: job.sourceRevision,
    };
  }
}

const SHARED = "savage.browserNative";
const sharedGlobal = globalThis as typeof globalThis & { [SHARED]?: BrowserNative };

export const browserNative = sharedGlobal[SHARED] ?? new BrowserNative();
sharedGlobal[SHARED] = browserNative;
