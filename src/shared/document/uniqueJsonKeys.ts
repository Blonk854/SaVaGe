class JsonKeyScanIncomplete extends Error {}

/**
 * JSON.parse keeps the last duplicate key. Reject that before parse so a
 * repeated node id cannot silently replace another node.
 */
export function assertUniqueJsonKeys(text: string): void {
  let i = 0;
  const n = text.length;
  const pool: Set<string>[] = [];
  const oneChar: Array<string | undefined> = new Array(128);

  const acquire = () => pool.pop() ?? new Set<string>();
  const release = (keys: Set<string>) => {
    keys.clear();
    pool.push(keys);
  };

  const fail = (): never => {
    throw new JsonKeyScanIncomplete();
  };

  const skipWs = () => {
    while (i < n) {
      const c = text[i];
      if (c !== " " && c !== "\n" && c !== "\r" && c !== "\t") return;
      i++;
    }
  };

  const skipLiteral = (word: string) => {
    if (!text.startsWith(word, i)) fail();
    i += word.length;
  };

  const skipNumber = () => {
    if (text[i] === "-") i++;
    if (text[i] === "0") i++;
    else if (text[i] >= "1" && text[i] <= "9") {
      while (text[i] >= "0" && text[i] <= "9") i++;
    } else fail();
    if (text[i] === ".") {
      i++;
      if (text[i] < "0" || text[i] > "9") fail();
      while (text[i] >= "0" && text[i] <= "9") i++;
    }
    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      if (text[i] < "0" || text[i] > "9") fail();
      while (text[i] >= "0" && text[i] <= "9") i++;
    }
  };

  const skipString = () => {
    if (text[i] !== '"') fail();
    i++;
    let escaped = false;
    while (i < n) {
      const c = text[i];
      if (escaped) {
        escaped = false;
        i++;
        continue;
      }
      if (c === "\\") {
        escaped = true;
        i++;
        continue;
      }
      if (c === '"') {
        i++;
        return;
      }
      i++;
    }
    fail();
  };

  const decodeJsonString = (raw: string): string => {
    let out = "";
    for (let j = 0; j < raw.length; j++) {
      const c = raw[j];
      if (c !== "\\") {
        out += c;
        continue;
      }
      const e = raw[++j];
      if (e === undefined) fail();
      if (e === "u") {
        const hex = raw.slice(j + 1, j + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail();
        out += String.fromCharCode(Number.parseInt(hex, 16));
        j += 4;
        continue;
      }
      if (e === '"' || e === "\\" || e === "/") out += e;
      else if (e === "b") out += "\b";
      else if (e === "f") out += "\f";
      else if (e === "n") out += "\n";
      else if (e === "r") out += "\r";
      else if (e === "t") out += "\t";
      else fail();
    }
    return out;
  };

  const readKey = (): string => {
    if (text[i] !== '"') fail();
    i++;
    const contentStart = i;
    let escaped = false;
    let sawEscape = false;
    while (i < n) {
      const c = text[i];
      if (escaped) {
        escaped = false;
        i++;
        continue;
      }
      if (c === "\\") {
        sawEscape = true;
        escaped = true;
        i++;
        continue;
      }
      if (c === '"') {
        const length = i - contentStart;
        i++;
        if (!sawEscape && length === 1) {
          const code = text.charCodeAt(contentStart);
          if (code < 128) {
            const cached = oneChar[code];
            if (cached !== undefined) return cached;
            const key = text[contentStart];
            oneChar[code] = key;
            return key;
          }
        }
        const raw = text.slice(contentStart, contentStart + length);
        return sawEscape ? decodeJsonString(raw) : raw;
      }
      i++;
    }
    return fail();
  };

  const keyLabel = (key: string) => {
    const shown = key.length > 80 ? `${key.slice(0, 80)}…` : key;
    return JSON.stringify(shown);
  };

  const parseValue = (): void => {
    skipWs();
    const c = text[i];
    if (c === "{") {
      parseObject();
      return;
    }
    if (c === "[") {
      parseArray();
      return;
    }
    if (c === '"') {
      skipString();
      return;
    }
    if (c === "t") {
      skipLiteral("true");
      return;
    }
    if (c === "f") {
      skipLiteral("false");
      return;
    }
    if (c === "n") {
      skipLiteral("null");
      return;
    }
    if (c === "-" || (c >= "0" && c <= "9")) {
      skipNumber();
      return;
    }
    fail();
  };

  const parseArray = () => {
    i++;
    skipWs();
    if (text[i] === "]") {
      i++;
      return;
    }
    while (i < n) {
      parseValue();
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        return;
      }
      fail();
    }
    fail();
  };

  const parseObject = () => {
    i++;
    skipWs();
    if (text[i] === "}") {
      i++;
      return;
    }
    const keys = acquire();
    try {
      while (i < n) {
        skipWs();
        const key = readKey();
        if (keys.has(key)) {
          throw new Error(`That file contains a duplicate JSON key ${keyLabel(key)}`);
        }
        keys.add(key);
        skipWs();
        if (text[i] !== ":") fail();
        i++;
        parseValue();
        skipWs();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") {
          i++;
          return;
        }
        fail();
      }
      fail();
    } finally {
      release(keys);
    }
  };

  try {
    skipWs();
    if (i >= n) return;
    parseValue();
  } catch (error) {
    if (error instanceof JsonKeyScanIncomplete) return;
    throw error;
  }
}
