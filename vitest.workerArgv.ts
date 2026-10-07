const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);

/**
 * Node 25+ turns on Web Storage unless this flag is set. That global shadows
 * jsdom, so `localStorage` has no Storage methods. The flag exists from
 * Node 22.4; earlier 22.x releases reject it.
 */
export const vitestWorkerArgv: string[] =
  major > 22 || (major === 22 && minor >= 4) ? ["--no-experimental-webstorage"] : [];
