import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { glyphsFor } from "../../../../src/core/rendering/theme/glyphs.ts";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("glyph sets", () => {
  // Private-use icons get lost when files are edited; an empty glyph draws nothing and shifts
  // whatever follows it. Every glyph must take up room, except the ones that are spacing by design.
  const blankByDesign = new Set(["file", "scrollTrack"]);
  const flatten = (v: unknown, path: string): [string, string][] =>
    typeof v === "string"
      ? [[path, v]]
      : Array.isArray(v)
        ? v.flatMap((x, i) => flatten(x, `${path}[${i}]`))
        : v && typeof v === "object"
          ? Object.entries(v).flatMap(([k, x]) => flatten(x, path ? `${path}.${k}` : k))
          : [];
  for (const mode of ["nerd", "unicode", "ascii"] as const) {
    test(`${mode}: no empty or zero-width glyphs`, () => {
      for (const [path, g] of flatten(glyphsFor(mode), "")) {
        if (path === "mode" || blankByDesign.has(path)) continue;
        expect({ path, width: stringWidth(g) > 0 }).toEqual({ path, width: true });
      }
    });
  }
  test("auto (rendering.md, Glyphs): ASCII for a locale that isn't UTF-8 or the Linux console, Nerd for the terminals that bundle it, else Unicode", () => {
    const auto = (env: NodeJS.ProcessEnv) => glyphsFor("auto", env).mode;
    expect(auto({ LANG: "C", TERM: "xterm-ghostty" })).toBe("ascii"); // a locale set, not UTF-8: whatever the terminal
    expect(auto({ LC_ALL: "en_US.ISO-8859-1", LANG: "en_US.UTF-8" })).toBe("ascii"); // LC_ALL wins over LANG
    expect(auto({ LC_CTYPE: "en_US.UTF-8", LANG: "C" })).toBe("unicode"); // LC_CTYPE before LANG
    expect(auto({ TERM: "linux", LANG: "en_US.UTF-8" })).toBe("ascii");
    for (const term of [{ TERM: "xterm-ghostty" }, { TERM: "xterm-kitty" }, { TERM_PROGRAM: "WezTerm" }])
      expect(auto({ LANG: "en_US.utf8", ...term })).toBe("nerd");
    expect(auto({ TERM: "xterm-256color", LANG: "en_US.UTF-8" })).toBe("unicode");
    expect(auto({ TERM: "xterm-256color" })).toBe("unicode"); // no locale at all isn't a non-UTF-8 one
    expect(glyphsFor("unicode", { TERM: "linux" }).mode).toBe("unicode"); // a set named in config is never guessed
  });
});
