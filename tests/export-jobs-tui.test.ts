import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PreparedExport, ExportSpool } from "../src/core/export/spool.ts";
import { ExportJob } from "../src/core/export/jobs.ts";
import { formatFor } from "../src/core/export/index.ts";
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
    h.app.run("note.export_cancel");
    expect(h.app.messages.at(-1)).toMatchObject({ level: "info", text: "no export is running" });
  } finally {
    ExportJob.prototype.prepare = previous;
  }
});
