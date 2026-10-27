import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { vault, slipbox, note } = makeCliProcessSandbox();

describe("writing", () => {
  describe("export: a Word document beside the note, its name; several notes one; --to, -o (a folder: its name in it), never over a note", () => {
    test("Word beside the note, then the earlier export replaced", () => {
      const r = slipbox(["export", "dome-refit"]);
      expect(r.code).toBe(0);
      expect(r.out).toBe("exported projects/dome-refit.md to projects/dome-refit.docx (Word (.docx))\n");
      expect(
        readFileSync(join(vault, "projects", "dome-refit.docx"))
          .subarray(0, 4)
          .toString("latin1"),
      ).toBe("PK\x03\x04");
      // An earlier export there, beside the note: replaced.
      expect(slipbox(["export", "dome-refit"]).code).toBe(0);
    });
    test("several notes in one Word document with a JSON byte count", () => {
      const j = slipbox([
        "export",
        "dome-refit",
        "pipeline-cookbook",
        "--to",
        "word",
        "-o",
        "exports/both.docx",
        "--json",
      ]).json;
      expect(j.data).toMatchObject({
        path: "exports/both.docx",
        format: "docx",
        notes: ["projects/dome-refit.md", "software/pipeline-cookbook.md"],
      });
      expect(j.data.bytes).toBe(readFileSync(join(vault, "exports", "both.docx")).length);
    });
    test("output extension and existing folder choose the destination", () => {
      // -o's extension says the format; a folder gets the note's name in it.
      expect(slipbox(["export", "dome-refit", "-o", "exports/upper.DOCX"]).code).toBe(0);
      expect(slipbox(["export", "dome-refit", "-o", "exports", "--json"]).json.data.path).toBe(
        "exports/dome-refit.docx",
      );
    });
    test("a foreign file is untouched until forced, then becomes a replaceable export", () => {
      mkdirSync(join(vault, "exports"), { recursive: true });
      // A file there that isn't an export: refused, untouched; --force writes over it, and then it's one.
      writeFileSync(join(vault, "exports", "mine.docx"), "mine\n");
      const mine = slipbox(["export", "dome-refit", "-o", "exports/mine.docx"]);
      expect([mine.code, mine.err]).toEqual([
        5,
        "slipbox: exports/mine.docx isn't an export — an export doesn't write over it without --force\n",
      ]);
      expect(readFileSync(join(vault, "exports", "mine.docx"), "utf8")).toBe("mine\n");
      expect(slipbox(["export", "dome-refit", "-o", "exports/mine.docx", "--force"]).code).toBe(0);
      expect(
        readFileSync(join(vault, "exports", "mine.docx"))
          .subarray(0, 4)
          .toString("latin1"),
      ).toBe("PK\x03\x04");
      expect(slipbox(["export", "dome-refit", "-o", "exports/mine.docx"]).code).toBe(0);
    });
    test("notes are protected even with force and unsupported formats are usage errors", () => {
      // A note: never, --force or not.
      for (const force of [[], ["--force"]]) {
        const over = slipbox(["export", "dome-refit", "-o", "home.md", "--to", "docx", ...force]);
        expect([over.code, over.err]).toEqual([5, "slipbox: home.md is a note — an export doesn't write over it\n"]);
      }
      expect(note("home.md")).toStartWith("# Halden Ridge Observatory\n");
      const bad = slipbox(["export", "dome-refit", "--to", "odt"]);
      expect([bad.code, bad.err]).toEqual([2, "slipbox: --to must be one of: docx, pdf, html, epub, md\n"]);
      expect(slipbox(["export", "dome-refit", "-o", "exports/x.odt"]).code).toBe(2);
      expect(existsSync(join(vault, "exports", "x.odt"))).toBe(false);
      expect(slipbox(["export"]).code).toBe(2);
    });
  });
});
