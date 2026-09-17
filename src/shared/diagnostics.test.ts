import { describe, expect, it } from "vitest";
import { exportDiagnostics, recordDiagnostic } from "./diagnostics";

describe("diagnostics", () => {
  it("sends a structured record without document contents", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    recordDiagnostic(
      {
        level: "error",
        code: "save_failed",
        operation: "save",
        operationId: "op_1",
        sessionId: "session_1",
        stage: "write",
        message: "conflict: destination changed",
      },
      async (command, args) => {
        calls.push({ command, args });
        return null;
      },
    );
    await Promise.resolve();
    expect(calls).toEqual([
      {
        command: "record_diagnostic",
        args: {
          request: {
            level: "error",
            code: "save_failed",
            operation: "save",
            operationId: "op_1",
            sessionId: "session_1",
            stage: "write",
            message: "conflict: destination changed",
          },
        },
      },
    ]);
    expect(JSON.stringify(calls)).not.toContain("nodes");
  });

  it("does not export until the user confirms the review prompt", async () => {
    const calls: string[] = [];
    const cancelled = await exportDiagnostics(
      async () => false,
      async (command) => {
        calls.push(command);
        return "C:\\\\temp\\\\savage-diagnostics.json";
      },
    );
    expect(cancelled).toBeNull();
    expect(calls).toEqual([]);

    const exported = await exportDiagnostics(
      async () => true,
      async (command) => {
        calls.push(command);
        return "C:\\\\temp\\\\savage-diagnostics.json";
      },
    );
    expect(exported).toBe("C:\\\\temp\\\\savage-diagnostics.json");
    expect(calls).toEqual(["export_diagnostics"]);
  });
});
