import { describe, expect, test } from "bun:test";
import { layoutToAnsi } from "../../../../src/core/rendering/layout/ansi.ts";
import { renderMarkdown } from "../../../../src/core/rendering/layout/markdown/render.ts";
import { loadTheme } from "../../../../src/core/rendering/theme/index.ts";
import { unicode } from "../../../support/render-layout.ts";
import { makeRenderSandbox } from "../../../support/render-sandbox.ts";

makeRenderSandbox();

describe("ANSI writer", () => {
  test("plain output has no escapes; colour output resets every line", () => {
    const layout = renderMarkdown("# Hi\n\n**bold** `code`\n", { width: 30, glyphs: unicode, showUrls: false });
    const theme = loadTheme("tokyo-night").theme;
    expect(layoutToAnsi(layout, theme, { depth: "none" })).not.toContain("\x1b");
    const colour = layoutToAnsi(layout, theme, { depth: "truecolor" });
    expect(colour).toContain("\x1b[0;38;2;");
    for (const line of colour.trimEnd().split("\n")) expect(line.endsWith("\x1b[0m")).toBe(true);
    expect(layoutToAnsi(layout, theme, { depth: "256" })).toContain("38;5;");
  });
});

describe("ANSI writer: colours the terminal can't show as given", () => {
  /** The SGR codes the writer gives a span of the text role, coloured `color`, at `depth`. */
  const codes = async (color: unknown, depth: "16" | "256" | "truecolor") => {
    const { lineToAnsi } = await import("../../../../src/core/rendering/layout/ansi.ts");
    const { applyColorOverrides } = await import("../../../../src/core/rendering/theme/index.ts");
    const { theme, warnings } = applyColorOverrides(loadTheme("tokyo-night").theme, { text: color });
    expect(warnings).toEqual([]);
    const out = lineToAnsi({ spans: [{ text: "x", role: "text", attrs: 0 }], src: 1 }, 1, theme, { depth });
    return /^\x1b\[0;([\d;]+)mx\x1b\[0m$/.exec(out)?.[1];
  };

  test("a palette number past 15 on a 16-colour terminal: the nearest of the 16, cube and greys alike", async () => {
    expect(await codes(196, "16")).toBe("91"); // #ff0000: bright red
    expect(await codes(21, "16")).toBe("94"); // #0000ff: bright blue
    expect(await codes(28, "16")).toBe("32"); // #008700: green
    expect(await codes(244, "16")).toBe("37"); // #808080: white, not bright
    expect(await codes(250, "16")).toBe("97"); // #bcbcbc: bright white
    expect(await codes(249, "16")).toBe("97"); // #b2b2b2: just bright
    expect(await codes(124, "16")).toBe("91"); // #af0000: just bright red
    expect(await codes(232, "16")).toBe("30"); // #080808: black
    expect(await codes({ fg: 4, bg: 196 }, "16")).toBe("34;101"); // the background's too
    expect(await codes(12, "16")).toBe("94"); // the 16 themselves as they are
    expect(await codes(196, "256")).toBe("38;5;196"); // as it is where the palette is there
  });

  test("a hex colour on a 256-colour terminal: the nearest of the cube or the greys; on 16, the nearest of those", async () => {
    expect(await codes("#ff0000", "256")).toBe("38;5;196");
    expect(await codes("#808080", "256")).toBe("38;5;244"); // a grey: the grey ramp, not the cube
    expect(await codes("#5f87af", "256")).toBe("38;5;67"); // on the cube exactly
    expect(await codes("#ff0000", "16")).toBe("91");
    expect(await codes("#303030", "16")).toBe("30"); // near black
    expect(await codes("#404040", "16")).toBe("90"); // a dark grey: bright black
    expect(await codes("#ff0000", "truecolor")).toBe("38;2;255;0;0");
  });
});
