import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { UNSAFE } from "../../../../src/core/foundation/text/sanitize.ts";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 4 (TUI, a hostile vault's names)", () => {
  test("names with bidi overrides, C1 and escapes never put a control on screen", async () => {
    const root = makeVault();
    const bad = "n-bidi\u202edcba\u202c\u200f\u2028-\u009b31m-\x1b]0;PWNED\x07.md";
    writeFileSync(join(root, bad), "# Bad\u202e name\n\n[alpha](notes/alpha.md)\n");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    writeFileSync(join(root, ".slipbox", "config.toml"), '[groups]\n"leader z" = "\u202eevil"\n');
    const h = await harness({ root, open: bad, width: 140, height: 40 });
    const shots = [h.frame()];
    await h.keys("space"); // which-key, with the vault's group label
    shots.push(h.frame());
    await h.keys("escape", "space", "space"); // the switcher lists it by name
    shots.push(h.frame());
    await h.keys("escape");
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("backlinks.open");
    shots.push(h.frame());
    for (const s of shots) {
      expect(UNSAFE.test(s.replace(/\n/g, ""))).toBe(false);
      expect(s).not.toContain("PWNED");
    }
    expect(shots.join("")).toContain("n-bidi");
  });
});
