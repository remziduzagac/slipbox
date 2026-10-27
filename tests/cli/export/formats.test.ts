import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { vault, slipbox, note } = makeCliProcessSandbox();

describe("writing", () => {
  describe("export to PDF, a web page, an e-book; Markdown beside it apart from the note, its pictures in a folder, an earlier one replaced", () => {
    function checkFormat(to: string, magic: string) {
      const r = slipbox(["export", "dome-refit", "--to", to, "--json"]);
      expect([r.code, r.json.data.path]).toEqual([0, `projects/dome-refit.${to}`]);
      expect(
        readFileSync(join(vault, "projects", `dome-refit.${to}`))
          .subarray(0, magic.length)
          .toString("latin1"),
      ).toBe(magic);
      // Again: the earlier export replaced, as it says it's one.
      expect(slipbox(["export", "dome-refit", "--to", to]).code).toBe(0);
    }
    test("PDF export and replacement", () => checkFormat("pdf", "%PDF-"));
    test("HTML export and replacement", () => checkFormat("html", "<!doctype html>"));
    test("EPUB export and replacement", () => checkFormat("epub", "PK\x03\x04"));
    test("Markdown and its picture folder, including replacement after indexing", () => {
      const md = slipbox(["export", "dome-refit", "--to", "markdown"]);
      expect(md.out).toBe(
        "exported projects/dome-refit.md to projects/dome-refit.export.md (Markdown (.md)), 1 file beside it\n",
      );
      expect(note("projects/dome-refit.export.md")).toContain(
        "![dome-shutter.png](dome-refit.export.assets/dome-shutter.png)",
      );
      expect(existsSync(join(vault, "projects", "dome-refit.export.assets", "dome-shutter.png"))).toBe(true);
      // Indexed now, a note — and still replaced, being an export.
      const again = slipbox(["export", "dome-refit", "--to", "md", "--json"]);
      expect([again.code, again.json.data.files]).toEqual([0, ["projects/dome-refit.export.assets/dome-shutter.png"]]);
    });
  });
});
