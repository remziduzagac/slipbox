import { describe, expect, test } from "bun:test";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 5 (TUI, the session while running)", () => {
  test("history sees the note on screen while slipbox runs, not only after quit", async () => {
    const { loadSession } = await import("../../../../src/core/workspace/session/position.ts");
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.app.run("note.open notes/beta.md");
    await h.keys("j");
    const end = Date.now() + 4000;
    const current = () => {
      const s = loadSession(h.app.loc);
      return s ? s.tabs[s.activeTab]?.panes[s.tabs[s.activeTab]!.active]?.path : undefined;
    };
    while (current() !== "notes/beta.md" && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    expect(current()).toBe("notes/beta.md");
  });
});
