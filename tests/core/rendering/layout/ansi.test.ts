import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { layoutToAnsi } from "../../../../src/core/rendering/layout/ansi.ts";
import { renderMarkdown } from "../../../../src/core/rendering/layout/markdown/render.ts";
import { loadTheme } from "../../../../src/core/rendering/theme/index.ts";
import { glyphsFor } from "../../../../src/core/rendering/theme/glyphs.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("review round 2 (core)", () => {
  const g = glyphsFor("unicode");

  test("a 256-colour palette entry is mapped to the 16 on a 16-colour terminal", () => {
    const theme = loadTheme("tokyo-night").theme;
    const t = { ...theme, roles: { ...theme.roles, text: { fg: "ansi:200" } } };
    const out = layoutToAnsi(renderMarkdown("hello\n", { width: 20, glyphs: g, showUrls: false }), t, { depth: "16" });
    expect(out).not.toContain("38;5;");
  });
});

describe("review cycle 5 (core, colour depth)", () => {
  test("NO_COLOR and a pipe mean none; COLORTERM and known terminals truecolor; TERM for the rest", async () => {
    const { detectColorDepth } = await import("../../../../src/core/rendering/layout/ansi.ts");
    expect(detectColorDepth({ NO_COLOR: "1", COLORTERM: "truecolor" }, true)).toBe("none");
    expect(detectColorDepth({ NO_COLOR: "", COLORTERM: "truecolor" }, true)).toBe("truecolor"); // empty NO_COLOR is unset
    expect(detectColorDepth({ COLORTERM: "truecolor" }, false)).toBe("none");
    expect(detectColorDepth({ COLORTERM: "24bit" }, true)).toBe("truecolor");
    expect(detectColorDepth({ TERM: "xterm-kitty" }, true)).toBe("truecolor");
    expect(detectColorDepth({ TERM: "xterm", TERM_PROGRAM: "WezTerm" }, true)).toBe("truecolor");
    expect(detectColorDepth({ TERM: "screen-256color" }, true)).toBe("256");
    expect(detectColorDepth({ TERM: "dumb" }, true)).toBe("none");
    expect(detectColorDepth({ TERM: "xterm" }, true)).toBe("16");
  });
});
