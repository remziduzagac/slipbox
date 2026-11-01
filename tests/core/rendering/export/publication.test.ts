import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Document, Packer } from "docx";
import { strToU8, zipSync } from "fflate";
import PDFDocument from "pdfkit";
import {
  defaultTarget,
  exportNotes,
  exportTarget,
  FORMATS,
  formatFor,
  isExport,
  NotAnExport,
  writeExport,
} from "../../../../src/core/rendering/export/index.ts";
import { userFolders } from "../../../../src/core/foundation/platform/paths.ts";
import { makeExportFixture, png } from "../../../support/export-fixture.ts";
import { unzip, xml } from "../../../support/export-readers.ts";

// Drawing diagrams and maths, writing a document: slow on a loaded machine, not stuck.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, root } = makeExportFixture();

describe("export: over a file only when it's an earlier export (D243)", () => {
  /** A PDF pdfkit makes with `info`: its Creator pdfkit's own unless it's given. */
  const pdfkitPdf = (info: Record<string, string>) =>
    new Promise<Buffer>((done) => {
      const d = new PDFDocument({ font: null as unknown as string, info });
      const parts: Buffer[] = [];
      d.on("data", (b: Buffer) => parts.push(b));
      d.on("end", () => done(Buffer.concat(parts)));
      d.end();
    });

  test("an earlier export, of every format, known by its mark: replaced, a new file anywhere written, a folder's default name too", async () => {
    const r = root({ "a.md": "---\nauthor: Ada\nlang: ja\n---\n\n# A\n\n![pic](pic.png)\n", "pic.png": png });
    const away = mkdtempSync(join(sandbox, "away-"));
    for (const f of FORMATS) {
      const target = join(away, `a.${f.ext}`);
      expect(exportTarget(r.graph, "a.md", f, target, r.dir)).toBe(target);
      writeExport(target, await exportNotes(r.graph, ["a.md"], f, target));
      expect([f.name, isExport(target)]).toEqual([f.name, true]);
      expect(exportTarget(r.graph, "a.md", f, target, r.dir)).toBe(target);
      // Beside the note, by default: there again, replaced.
      const beside = exportTarget(r.graph, "a.md", f, null, r.dir);
      writeExport(beside, await exportNotes(r.graph, ["a.md"], f, beside));
      expect(exportTarget(r.graph, "a.md", f, null, r.dir)).toBe(beside);
      // A folder named: its default name in it, an earlier export there replaced.
      expect(exportTarget(r.graph, "a.md", f, away, r.dir)).toBe(join(away, `a${f.suffix}`));
    }
    // Each writer's mark, where it is.
    expect(xml(unzip(readFileSync(join(away, "a.docx"))), "docProps/custom.xml")).toContain(
      'name="generator"><vt:lpwstr>slipbox</vt:lpwstr></property>',
    );
    expect(xml(unzip(readFileSync(join(away, "a.epub"))), "OEBPS/content.opf")).toContain(
      '<meta name="generator" content="slipbox"/>',
    );
    expect(readFileSync(join(away, "a.html"), "utf8")).toContain('<meta name="generator" content="slipbox">');
    // A link to one is it.
    symlinkSync(join(away, "a.pdf"), join(away, "link.pdf"));
    expect(exportTarget(r.graph, "a.md", formatFor("pdf")!, join(away, "link.pdf"), r.dir)).toBe(
      join(away, "link.pdf"),
    );
  });

  test("any other file there, of the format or not, refused unless forced: another's, one damaged, a link to nowhere; a note even forced", async () => {
    const r = root({ "a.md": "# A\n", "notes.md": "# Mine\n" });
    const away = mkdtempSync(join(sandbox, "theirs-"));
    const theirs: Record<string, string | Uint8Array> = {
      // Word's, as every export before the mark had (the docx library's own, no custom property).
      "word.docx": new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children: [] }] }))),
      // pdfkit's, its Creator pdfkit; another's that says slipbox elsewhere.
      "pdfkit.pdf": await pdfkitPdf({ Title: "Theirs" }),
      "titled.pdf": await pdfkitPdf({ Title: "slipbox", Author: "slipbox" }),
      // A web page of another generator, slipbox's meta in its body as text and as markup.
      "page.html": `<!doctype html><html><head><meta name="generator" content="Hugo"><title>T</title></head><body><p>&lt;meta name="generator" content="slipbox"&gt;</p><meta name="generator" content="slipbox"></body></html>\n`,
      // An e-book of another generator.
      "book.epub": zipSync({
        mimetype: [strToU8("application/epub+zip"), { level: 0 }],
        "OEBPS/content.opf": strToU8(
          '<package><metadata><meta name="generator" content="Calibre"/></metadata></package>',
        ),
      }),
      // Markdown with frontmatter but no mark; the mark in its text only.
      "fm.md": "---\ntitle: T\n---\n\n# T\n",
      "body.md": "# T\n\ngenerator: slipbox\n",
      "plain.txt": "mine\n",
      "empty.docx": "",
    };
    for (const [name, body] of Object.entries(theirs)) writeFileSync(join(away, name), body);
    // slipbox's own, cut short: its mark can't be read, so it isn't one.
    for (const ext of ["pdf", "docx", "epub"]) {
      const whole = join(away, `whole.${ext}`);
      writeExport(whole, await exportNotes(r.graph, ["a.md"], formatFor(ext)!, whole));
      expect(isExport(whole)).toBe(true);
      const data = readFileSync(whole);
      writeFileSync(join(away, `cut.${ext}`), data.subarray(0, data.length - 200));
      theirs[`cut.${ext}`] = "";
    }
    symlinkSync(join(away, "nowhere.docx"), join(away, "dangling.docx"));
    theirs["dangling.docx"] = "";
    // A pipe: told at once, never waited on for a writer.
    expect(Bun.spawnSync(["mkfifo", join(away, "pipe.docx")]).exitCode).toBe(0);
    theirs["pipe.docx"] = "";
    const docx = formatFor("docx")!;
    for (const name of Object.keys(theirs)) {
      const target = join(away, name);
      expect([name, isExport(target)]).toEqual([name, false]);
      expect(() => exportTarget(r.graph, "a.md", docx, target, r.dir)).toThrow(
        `${target} isn't an export — an export doesn't write over it without --force`,
      );
      expect(exportTarget(r.graph, "a.md", docx, target, r.dir, true)).toBe(target);
    }
    // What's refused says where it would have gone; a note refused before, force or not.
    let refused: unknown = null;
    try {
      exportTarget(r.graph, "a.md", docx, join(away, "plain.txt"), r.dir);
    } catch (err) {
      refused = err;
    }
    expect(refused).toBeInstanceOf(NotAnExport);
    expect((refused as NotAnExport).target).toBe(join(away, "plain.txt"));
    expect(() => exportTarget(r.graph, "a.md", docx, "notes.md", r.dir, true)).toThrow(
      "notes.md is a note — an export doesn't write over it",
    );
  });

  test("a mark says slipbox wrote it, it doesn't prove it: a PDF of another's that says slipbox made it is taken for one", () => {
    const away = mkdtempSync(join(sandbox, "forged-"));
    const head = "%PDF-1.4\n";
    const obj = "1 0 obj\n<< /Creator (slipbox) >>\nendobj\n";
    const xref = `xref\n0 2\n0000000000 65535 f \n${String(head.length).padStart(10, "0")} 00000 n \n`;
    const pdf = `${head}${obj}${xref}trailer\n<< /Size 2 /Info 1 0 R >>\nstartxref\n${head.length + obj.length}\n%%EOF\n`;
    writeFileSync(join(away, "says.pdf"), pdf);
    expect(isExport(join(away, "says.pdf"))).toBe(true);
    writeFileSync(join(away, "other.pdf"), pdf.replace("(slipbox)", "(slipbot)"));
    expect(isExport(join(away, "other.pdf"))).toBe(false);
  });
});

describe("export: your folders (10.14)", () => {
  test("Downloads, Desktop, Documents where the desktop says (in its own words), else in English; those there are; then home", () => {
    const home = mkdtempSync(join(sandbox, "home-"));
    const config = mkdtempSync(join(sandbox, "config-"));
    for (const d of ["İndirilenler", "Documents"]) mkdirSync(join(home, d));
    expect(userFolders(home, config)).toEqual([
      { name: "Documents", path: join(home, "Documents") },
      { name: "Home", path: home },
    ]);
    writeFileSync(
      join(config, "user-dirs.dirs"),
      '# made by xdg-user-dirs\nXDG_DOWNLOAD_DIR="$HOME/İndirilenler"\nXDG_DESKTOP_DIR="$HOME/"\n',
    );
    expect(userFolders(home, config).map((f) => [f.name, f.path])).toEqual([
      ["Downloads", join(home, "İndirilenler")],
      ["Documents", join(home, "Documents")],
      ["Home", home],
    ]);
    expect(userFolders(join(home, "none"), config)).toEqual([]);
  });
});

describe("export: the formats", () => {
  test("a format by its name, another name for it, or an extension; beside the note, its name, by default", () => {
    expect(FORMATS.map((f) => f.name)).toEqual(["docx", "pdf", "html", "epub", "md"]);
    for (const name of ["docx", "DOCX", ".docx", "word", "doc"]) expect(formatFor(name)?.name).toBe("docx");
    for (const [name, format] of [
      ["htm", "html"],
      ["web", "html"],
      ["markdown", "md"],
      [".MD", "md"],
      ["ebook", "epub"],
      ["PDF", "pdf"],
    ])
      expect(formatFor(name!)?.name).toBe(format!);
    expect(formatFor("odt")).toBeNull();
    expect(defaultTarget("/v/notes/Field Report.md", formatFor("word")!)).toBe("/v/notes/Field Report.docx");
    // Markdown's apart from the note it's of.
    expect(defaultTarget("/v/notes/Field Report.md", formatFor("md")!)).toBe("/v/notes/Field Report.export.md");
  });
});
