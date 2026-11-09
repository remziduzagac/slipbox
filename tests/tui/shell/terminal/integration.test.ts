import { describe, expect, test } from "bun:test";
import { type Config, DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { App } from "../../../../src/tui/app/runtime/app.ts";
import { keyName } from "../../../../src/tui/shell/input/keys.ts";
import type { CellStyle } from "../../../../src/core/rendering/layout/style.ts";
import { makeSandbox, makeVault } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("OpenTUI end to end", () => {
  test("real key parsing and the frame-buffer adapter", async () => {
    const { createTestRenderer } = await import("@opentui/core/testing");
    const { AppRenderable } = await import("../../../../src/tui/shell/terminal/opentui.ts");
    const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({ width: 100, height: 24 });
    const root = makeVault();
    const config: Config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    config.lint.enabled = "off";
    config.render.glyphs = "unicode";
    const loc = locateVault({ root });
    const app = new App({
      loc,
      config,
      graph: openGraph(loc, config, false),
      host: { requestRender: () => renderer.requestRender(), osc52: () => true, quit() {} },
      open: "index.md",
      watch: false,
    });
    renderer.root.add(new AppRenderable(renderer, (c) => app.draw(c)));
    renderer.keyInput.on("keypress", (k) => void app.input.handleKey(keyName(k)));
    await renderOnce();
    expect(captureCharFrame()).toContain("Home");
    const wait = () => new Promise((r) => setTimeout(r, 20));
    // The test renderer has no kitty protocol, so ctrl+tab would arrive as tab: use the leader.
    for (const k of [" ", "l", "n"]) {
      mockInput.pressKey(k);
      await wait();
    }
    mockInput.pressEnter();
    await wait();
    await renderOnce();
    expect(app.view!.buf.rel).toBe("notes/alpha.md");
    mockInput.pressKey(" ");
    await wait();
    await renderOnce();
    expect(captureCharFrame()).toContain("+links");
    renderer.destroy();
  });

  test("the pointer's events are its own: OpenTUI looking again after a frame, the pointer not moved, says nothing", async () => {
    // Since 0.6 OpenTUI looks again at what's under the pointer after every frame, and says `out` and `over` when that
    // changes; the git panel held its rows for a pointer that hadn't moved (D261).
    const { createTestRenderer } = await import("@opentui/core/testing");
    const { BoxRenderable } = await import("@opentui/core");
    const { AppRenderable } = await import("../../../../src/tui/shell/terminal/opentui.ts");
    const { renderer, renderOnce, mockMouse } = await createTestRenderer({ width: 20, height: 6 });
    const got: string[] = [];
    renderer.root.add(
      new AppRenderable(
        renderer,
        () => {},
        undefined,
        (e) => got.push(`${e.type} ${e.x},${e.y}`),
      ),
    );
    try {
      await renderOnce();
      await mockMouse.moveTo(5, 1);
      await renderOnce();
      expect(got).toEqual(["move 5,1"]);
      // Something else under the pointer for a frame, then not: the pointer still.
      const box = new BoxRenderable(renderer, { position: "absolute", left: 4, top: 0, width: 4, height: 3 });
      renderer.root.add(box);
      await renderOnce();
      renderer.root.remove(box);
      await renderOnce();
      expect(got).toEqual(["move 5,1"]);
      await mockMouse.moveTo(6, 2);
      expect(got).toEqual(["move 5,1", "move 6,2"]);
    } finally {
      renderer.destroy();
    }
  });

  test("a place with a fraction is drawn at its whole cell, the frame kept", async () => {
    // OpenTUI 0.6 throws at a fractional coordinate inside the paint step, and the frame is lost; 0.5 dropped the
    // fraction. The canvas drops it, as 0.5 did.
    const { createTestRenderer } = await import("@opentui/core/testing");
    const { AppRenderable } = await import("../../../../src/tui/shell/terminal/opentui.ts");
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 20, height: 4 });
    const style: CellStyle = {
      fg: "#ffffff",
      bg: null,
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      dim: false,
    };
    renderer.root.add(
      new AppRenderable(renderer, (c) => {
        c.ascii(0, 0, "kept", style);
        c.ascii(2.5, 1.5, "half", style);
        c.fill(0.5, 2, 3.7, 1, "#202020");
        c.cell(6.9, 2, "x", 1, style);
      }),
    );
    try {
      await renderOnce();
      const rows = captureCharFrame().split("\n");
      expect(rows[0]).toStartWith("kept");
      expect(rows[1]).toStartWith("  half");
      expect(rows[2]).toStartWith("      x");
    } finally {
      renderer.destroy();
    }
  });
});
