import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PreparedExport, ExportSpool } from "../src/core/export/spool.ts";
import { ExportJob } from "../src/core/export/jobs.ts";
import { formatFor } from "../src/core/export/index.ts";
import type { SaveAsOverlay } from "../src/tui/saveas.ts";
import { harness, makeSandbox, makeVault } from "./tui-harness.ts";

makeSandbox();
test("a pending export leaves keys available and rechecks its target before publication", async () => {
  const root = makeVault();
  writeFileSync(join(root, "exported.md"), "# Export\n\nOne\n\nTwo\n");
  const h = await harness({ root, open: "exported.md" });
  const target = join(root, "result.html");
  const previous = ExportJob.prototype.prepare;
  let complete!: (value: PreparedExport) => void;
  ExportJob.prototype.prepare = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  try {
    const pending = h.app.exporter.write(["exported.md"], formatFor("html")!, target);
    await h.keys("j");
    expect(existsSync(target)).toBe(false);
    writeFileSync(target, "created while export was preparing");
    const dir = await PreparedExport.directory();
    const spool = new ExportSpool(dir);
    await spool.document(async (sink) => sink(new TextEncoder().encode("new export")));
    complete(await PreparedExport.take(dir, spool.manifest));
    await pending;
    expect(readFileSync(target, "utf8")).toBe("created while export was preparing");
    expect(h.app.messages.at(-1)?.text).toContain("not written");
  } finally {
    ExportJob.prototype.prepare = previous;
  }
});

test("an export started while another runs is written too, not refused", async () => {
  const root = makeVault();
  writeFileSync(join(root, "exported.md"), "# Export\n\nOne\n");
  const h = await harness({ root, open: "exported.md" });
  const first = h.app.exporter.write(["exported.md"], formatFor("html")!, join(root, "first.html"));
  const second = h.app.exporter.write(["exported.md"], formatFor("md")!, join(root, "second.export.md"));
  await Promise.all([first, second]);
  expect(h.app.messages.filter((m) => m.level !== "info")).toEqual([]);
  expect(existsSync(join(root, "first.html"))).toBe(true);
  expect(readFileSync(join(root, "second.export.md"), "utf8")).toContain("# Export");
});

test("the folder exported to is remembered once the file is written: the window opened while its staging is cleared opens there", async () => {
  const root = makeVault();
  writeFileSync(join(root, "exported.md"), "# Export\n\nOne\n");
  mkdirSync(join(root, "out"));
  const h = await harness({ root, open: "exported.md" });
  const previous = PreparedExport.prototype.dispose;
  // The staging's cleanup held back, as a slow or loaded disk may hold it, till the window has been opened again.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let cleaning = false;
  PreparedExport.prototype.dispose = async function (this: PreparedExport) {
    cleaning = true;
    await held;
    return previous.call(this);
  };
  try {
    const pending = h.app.exporter.write(["exported.md"], formatFor("docx")!, join(root, "out", "exported.docx"));
    for (const t = Date.now(); !cleaning && Date.now() - t < 25_000; ) await Bun.sleep(10);
    expect([cleaning, existsSync(join(root, "out", "exported.docx"))]).toEqual([true, true]);
    expect(h.app.messages.at(-1)?.text).not.toStartWith("exported");
    await h.keys("space", "n", "o", "enter");
    const o = h.app.overlay as SaveAsOverlay;
    expect(o.kind).toBe("saveas");
    expect(o.dir).toBe(join(root, "out"));
    expect(o.places.map((p) => p.label)).toContain("Last export");
    await h.keys("escape");
    release();
    await pending;
    expect(h.app.messages.at(-1)?.text).toBe("exported exported.md to out/exported.docx (Word (.docx))");
  } finally {
    release();
    PreparedExport.prototype.dispose = previous;
  }
});

test("Cancel export stops every export running, none written; with none running, it says so", async () => {
  const root = makeVault();
  writeFileSync(join(root, "exported.md"), "# Export\n\nOne\n");
  const h = await harness({ root, open: "exported.md" });
  const previous = ExportJob.prototype.prepare;
  // Exports that never finish by themselves: only a cancel ends them.
  ExportJob.prototype.prepare = (_request, options) =>
    new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(Error("export cancelled")));
    });
  try {
    const both = [
      h.app.exporter.write(["exported.md"], formatFor("html")!, join(root, "first.html")),
      h.app.exporter.write(["exported.md"], formatFor("md")!, join(root, "second.export.md")),
    ];
    h.app.run("note.export_cancel");
    await Promise.all(both);
    expect(h.app.messages.at(-1)).toMatchObject({ level: "info", text: "export cancelled" });
    expect([existsSync(join(root, "first.html")), existsSync(join(root, "second.export.md"))]).toEqual([false, false]);
    expect(h.app.exporter.lastDir()).toBeNull();
    h.app.run("note.export_cancel");
    expect(h.app.messages.at(-1)).toMatchObject({ level: "info", text: "no export is running" });
  } finally {
    ExportJob.prototype.prepare = previous;
  }
});
