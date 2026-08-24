import { createHash } from "node:crypto";

export function canonicalize(value) {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    assertWellFormedUnicode(value);
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite numbers are not canonical JSON");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        assertWellFormedUnicode(key);
        return `${JSON.stringify(key)}:${canonicalize(value[key])}`;
      });
    return `{${entries.join(",")}}`;
  }

  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

function assertWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError("Lone surrogate is not canonical JSON");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("Lone surrogate is not canonical JSON");
    }
  }
}

export function digest(value) {
  return createHash("sha256").update(canonicalize(value)).digest("base64url");
}
