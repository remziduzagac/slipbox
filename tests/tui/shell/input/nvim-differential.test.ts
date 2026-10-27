import { TEST_BUDGETS } from "../../../support/timeouts.ts";
import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 5 (editing against nvim)", () => {
  // Each case's expected text is what `nvim --clean` makes of the same keys (with the final newline
  // slipbox adds to a note that had none). Run in source mode and in the lens: both must agree.
  const CASES: [string, string, string[], string][] = [
    ["noeol-o", "a", ["o", "b", "<Esc>"], "a\nb\n"],
    ["noeol-Aenter", "ab", ["A", "<CR>", "x", "<Esc>"], "ab\nx\n"],
    ["noeol-jo", "x\na", ["j", "o", "b", "<Esc>"], "x\na\nb\n"],
    ["noeol-crlf", "a\r\nb", ["j", "o", "c", "<Esc>"], "a\r\nb\r\nc\r\n"],
    ["empty-o", "", ["o", "a", "<Esc>"], "\na\n"],
    ["trail-x", "line one  \n", ["$", "x"], "line one \n"],
    ["wDp", "one two\n", ["w", "D", "p"], "one two\n"],
    ["tab-lx", "\ta\n", ["l", "x"], "\t\n"],
    ["tab-llx", "a\tbc\n", ["l", "l", "x"], "a\tc\n"],
    ["diW", "a.b c\n", ["d", "i", "W"], " c\n"],
    ["daW", "a.b c\n", ["d", "a", "W"], "c\n"],
    ["diB", "f {a b} x\n", ["f", "a", "d", "i", "B"], "f {} x\n"],
    ["viwd", "a.b c\n", ["v", "i", "w", "d"], ".b c\n"],
    ["vi(d", "f(ab) x\n", ["f", "a", "v", "i", "(", "d"], "f() x\n"],
    ["d3G", "a\nb\nc\nd\n", ["d", "3", "G"], "d\n"],
    ["3dG", "a\nb\nc\nd\n", ["3", "d", "G"], "d\n"],
    ["Gd2gg", "a\nb\nc\nd\n", ["G", "d", "2", "g", "g"], "a\n"],
    ["v2jd", "a\nb\nc\nd\n", ["v", "2", "j", "d"], "\nd\n"],
    ["V2>", "a\nb\nc\n", ["V", "2", ">"], "    a\nb\nc\n"],
    ["wd}", "a b\nc\n\nd\n", ["w", "d", "}"], "a \n\nd\n"],
    ["c}", "a\nb\n\nc\n", ["c", "}", "X", "<Esc>"], "X\n\nc\n"],
    ["y}P", "a\nb\n\nc\n", ["y", "}", "G", "P"], "a\nb\n\na\nb\nc\n"],
    ["jdb", "a b\nc\n", ["j", "d", "b"], "a \nc\n"],
    ["d}last", "a\n\nb\n", ["j", "j", "d", "}"], "a\n\n\n"],
    ['da"', 'x "a b" y\n', ["f", "a", "d", "a", '"'], "x y\n"],
    ["dap-last", "a\n\nb\nc\n", ["G", "d", "a", "p"], "a\n"],
    ["ci(ml", "f(\n  a\n)\n", ["j", "c", "i", "b", "X", "<Esc>"], "f(\n  X\n)\n"],
    ["vjyP", "ab\ncd\n", ["v", "j", "y", "P"], "ab\ncab\ncd\n"],
    ["Vjyp", "ab\ncd\nef\n", ["V", "j", "y", "p"], "ab\nab\ncd\ncd\nef\n"],
    ["3dl", "abc\n", ["3", "d", "l"], "\n"],
    ["d3l", "abc\n", ["d", "3", "l"], "\n"],
    ["cu-typed", "ab cd\n", ["A", "X", "Y", "<C-u>", "<Esc>"], "ab cd\n"],
    ["lensG", "# T\n\n- a\n- b\n- c\n\nx\nlast\n", ["G", "d", "d"], "# T\n\n- a\n- b\n- c\n\nx\n"],
    ["lensdG", "# T\n\n- a\n- b\n- c\n\nx\nlast\n", ["j", "j", "d", "G"], "# T\n\n"],
    ["lensGi", "# T\n\n- a\n- b\n- c\n\nx\nlast\n", ["G", "i", "Z", "<Esc>"], "# T\n\n- a\n- b\n- c\n\nx\nZlast\n"],
    // An operator's f / t takes a digit as its character, not as a count.
    ["df1", "abc 123 x\n", ["d", "f", "1"], "23 x\n"],
    ["dt1", "abc 123 x\n", ["d", "t", "1"], "123 x\n"],
    ["ct3", "abc 123 x\n", ["c", "t", "3", "Z", "<Esc>"], "Z3 x\n"],
    // D with a count past the last line: to the last line's end, its line break kept; from the
    // last line, nothing.
    ["5D-mid", "a\nxb\nc\n", ["j", "l", "5", "D"], "a\nx\n"],
    ["5D-last", "a\nb\n", ["j", "5", "D"], "a\nb\n"],
  ];
  const SPECIAL: Record<string, string> = {
    "<Esc>": "escape",
    "<C-u>": "ctrl+u",
    "<C-w>": "ctrl+w",
    "<CR>": "enter",
    "<BS>": "backspace",
  };
  const key = (t: string) => SPECIAL[t] ?? (t === " " ? "space" : /^[A-Z]$/.test(t) ? `shift+${t.toLowerCase()}` : t);
  for (const mode of ["v", "l"] as const) {
    test(
      `${mode === "v" ? "source mode" : "the lens"}: ${CASES.length} cases agree with nvim`,
      async () => {
        const wrong: string[] = [];
        for (const [id, input, keys, want] of CASES) {
          const root = makeVault();
          writeFileSync(join(root, "v.md"), input);
          const h = await harness({ root, open: "v.md", width: 200, height: 40 });
          await h.keys("space", "n", mode);
          for (const k of keys) await h.keys(key(k));
          const got = h.app.view!.buf.source;
          if (got !== want) wrong.push(`${id}: ${JSON.stringify(got)} (nvim ${JSON.stringify(want)})`);
        }
        expect(wrong).toEqual([]);
      },
      TEST_BUDGETS.nvimDifferential,
    );
  }
});
