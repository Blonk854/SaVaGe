import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function cspDirectives(policy: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  for (const part of policy.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens[0]) directives[tokens[0]] = tokens.slice(1);
  }
  return directives;
}

describe("production CSP and native command boundary", () => {
  it("keeps script execution local and denies remote connect, image, and font loads", () => {
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      app: { security: { csp: string; devCsp: string } };
    };
    const production = cspDirectives(tauri.app.security.csp);
    const development = cspDirectives(tauri.app.security.devCsp);
    const joined = Object.values(production).flat().join(" ");

    expect(production["default-src"]).toEqual(["'self'"]);
    expect(production["script-src"]).toEqual(["'self'"]);
    expect(production["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(production["img-src"]).toEqual(["'self'", "data:", "blob:"]);
    expect(production["font-src"]).toEqual(["'self'", "data:"]);
    expect(production["connect-src"]).toEqual(["'self'", "ipc:", "http://ipc.localhost"]);
    expect(joined).not.toMatch(/unsafe-eval|https:|\*/);

    expect(development["connect-src"]).toEqual([
      "'self'",
      "ipc:",
      "http://ipc.localhost",
      "ws://localhost:1421",
    ]);
    expect(development["script-src"]).toEqual(["'self'"]);
  });

  it("does not grant filesystem, shell, or HTTP plugins to the webview", () => {
    const capabilities = JSON.parse(read("src-tauri/capabilities/default.json")) as {
      permissions: string[];
    };
    expect(capabilities.permissions).toEqual([
      "core:default",
      "core:window:allow-destroy",
      "dialog:default",
    ]);
    expect(capabilities.permissions.join(" ")).not.toMatch(/\bfs:|\bshell:|\bhttp:/);
  });

  it("registers grant-backed writes and does not expose a raw-path text writer", () => {
    const lib = read("src-tauri/src/lib.rs");
    expect(lib).toMatch(/read_project_file/);
    expect(lib).toMatch(/write_project_file/);
    expect(lib).toMatch(/write_svg_export/);
    expect(lib).toMatch(/export_png/);
    expect(lib).toMatch(/cancel_export_job/);
    expect(lib).toMatch(/convert_image_to_svg/);
    expect(lib).not.toMatch(/\bwrite_text_file\b/);
  });
});
