import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PreparedExport, ExportSpool } from "../src/core/export/spool.ts";
import { ExportJob } from "../src/core/export/jobs.ts";
import { formatFor } from "../src/core/export/index.ts";
import type { SaveAsOverlay } from "../src/tui/saveas.ts";
import { harness, makeSandbox, makeVault } from "./tui-harness.ts";

makeSandbox();

/** The staging's cleanup held back, as a slow or loaded disk may hold it, till `release`; `restore` puts it back. */
function holdCleanup() {
  const previous = PreparedExport.prototype.dispose;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const hold = {
    cleaning: false,
    release: () => release(),
    restore: () => {
      PreparedExport.prototype.dispose = previous;
    },
    /** Till the cleanup has begun, and is held. */
    async begun() {
      for (const t = Date.now(); !hold.cleaning && Date.now() - t < 25_000; ) await Bun.sleep(10);
      expect(hold.cleaning).toBe(true);
    },
  };
  PreparedExport.prototype.dispose = async function (this: PreparedExport) {
    hold.cleaning = true;
    await held;
    return previous.call(this);
  };
  return hold;
}

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
    expect([...h.app.background.tasks.values()].map((task) => task.label)).toEqual([
      `Export to ${h.app.graph.shownPath(target)}`,
    ]);
    await h.keys("j");
    expect(existsSync(target)).toBe(false);
    writeFileSync(target, "created while export was preparing");
    const dir = await PreparedExport.directory();
    const spool = new ExportSpool(dir);
    await spool.document(async (sink) => sink(new TextEncoder().encode("new export")));
    complete(await PreparedExport.take(dir, spool.manifest));
    await pending;
    expect(h.app.background.tasks.size).toBe(0);
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
  // The cleanup held till the window has been opened again.
  const hold = holdCleanup();
  let pending: Promise<void> | undefined;
  try {
    pending = h.app.exporter.write(["exported.md"], formatFor("docx")!, join(root, "out", "exported.docx"));
    await hold.begun();
    expect(existsSync(join(root, "out", "exported.docx"))).toBe(true);
    await h.keys("space", "n", "o", "enter");
    const o = h.app.overlay as SaveAsOverlay;
    expect(o.kind).toBe("saveas");
    expect(o.dir).toBe(join(root, "out"));
    expect(o.places.map((p) => p.label)).toContain("Last export");
    await h.keys("escape");
    hold.release();
    await pending;
    expect(h.app.messages.at(-1)?.text).toBe("exported exported.md to out/exported.docx (Word (.docx))");
  } finally {
    // Let go and over, whatever failed: nothing of it left to run into the next test.
    hold.release();
    await pending;
    hold.restore();
  }
});

test("an export is over once its file is written: said then, its staging cleared after, a cancel meanwhile finding none running", async () => {
  const root = makeVault();
  writeFileSync(join(root, "exported.md"), "# Export\n\nOne\n");
  const h = await harness({ root, open: "exported.md" });
  const hold = holdCleanup();
  let pending: Promise<void> | undefined;
  try {
    pending = h.app.exporter.write(["exported.md"], formatFor("docx")!, join(root, "exported.docx"));
    await hold.begun();
    // Said while its staging is still being cleared.
    expect(h.app.messages.at(-1)).toMatchObject({
      level: "info",
      text: "exported exported.md to exported.docx (Word (.docx))",
    });
    h.app.run("note.export_cancel");
    expect(h.app.messages.at(-1)).toMatchObject({ level: "info", text: "no export is running" });
    hold.release();
    await pending;
    // Written, kept as where you exported last, and nothing said after: no cancel taken, no second "exported".
    expect(readFileSync(join(root, "exported.docx")).subarray(0, 2).toString()).toBe("PK");
    expect(h.app.exporter.lastDir()).toBe(root);
    expect(h.app.messages.at(-1)?.text).toBe("no export is running");
    expect(h.app.messages.filter((m) => m.text.startsWith("exported "))).toHaveLength(1);
  } finally {
    hold.release();
    await pending;
    hold.restore();
  }
});

test("an export is over once a cancel can't stop it: from the last check before its document's rename, a cancel finds none running", async () => {
  const root = makeVault();
  writeFileSync(join(root, "exported.md"), "# Export\n\nOne\n");
  const h = await harness({ root, open: "exported.md" });
  const publish = PreparedExport.prototype.publish;
  // Cancelled as the target is checked the last time, just before the document's rename: once before the copies, then
  // twice a file (before its mode is set, before its rename); a Word document has nothing beside it.
  PreparedExport.prototype.publish = function (this: PreparedExport, target, revalidate, signal, committing) {
    let checks = 0;
    const last = 1 + 2 * (this.manifest.files.length + 1);
    const check = () => {
      revalidate();
      if (++checks === last) h.app.run("note.export_cancel");
    };
    return publish.call(this, target, check, signal, committing);
  };
  try {
    await h.app.exporter.write(["exported.md"], formatFor("docx")!, join(root, "exported.docx"));
  } finally {
    PreparedExport.prototype.publish = publish;
  }
  expect(h.app.messages.slice(-2).map((m) => m.text)).toEqual([
    "no export is running",
    "exported exported.md to exported.docx (Word (.docx))",
  ]);
  expect(existsSync(join(root, "exported.docx"))).toBe(true);
});

test("a cleanup that fails is said after the export, the newest message", async () => {
  const root = makeVault();
  writeFileSync(join(root, "exported.md"), "# Export\n\nOne\n");
  const h = await harness({ root, open: "exported.md" });
  const previous = PreparedExport.prototype.dispose;
  // Cleared, then failing as a folder that can't be removed fails.
  PreparedExport.prototype.dispose = async function (this: PreparedExport) {
    await previous.call(this);
    throw Error("the staging folder is busy");
  };
  try {
    await h.app.exporter.write(["exported.md"], formatFor("docx")!, join(root, "exported.docx"));
  } finally {
    PreparedExport.prototype.dispose = previous;
  }
  expect(h.app.messages.slice(-2).map((m) => [m.level, m.text])).toEqual([
    ["info", "exported exported.md to exported.docx (Word (.docx))"],
    ["warn", "export cleanup: the staging folder is busy"],
  ]);
  // The one the screen shows first.
  expect(h.app.transient?.text).toBe("export cleanup: the staging folder is busy");
});

test("an export that fails, or is cancelled, is over once that's said: a cancel during its cleanup finds none running", async () => {
  const root = makeVault();
  writeFileSync(join(root, "exported.md"), "# Export\n\nOne\n");
  mkdirSync(join(root, "ro"));
  const h = await harness({ root, open: "exported.md" });
  // Failed: into a folder that can't be written.
  chmodSync(join(root, "ro"), 0o555);
  let hold = holdCleanup();
  let pending: Promise<void> | undefined;
  try {
    pending = h.app.exporter.write(["exported.md"], formatFor("docx")!, join(root, "ro", "exported.docx"));
    await hold.begun();
    expect(h.app.messages.at(-1)?.text).toStartWith("export: ro/exported.docx not written — ");
    h.app.run("note.export_cancel");
    expect(h.app.messages.at(-1)).toMatchObject({ level: "info", text: "no export is running" });
  } finally {
    hold.release();
    await pending;
    hold.restore();
    chmodSync(join(root, "ro"), 0o755);
  }
  // Cancelled while it's published: a publication that ends only when it's cancelled.
  const publish = PreparedExport.prototype.publish;
  let publishing = false;
  PreparedExport.prototype.publish = (_target, _revalidate, signal) => {
    publishing = true;
    return new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(Error("export cancelled")));
    });
  };
  hold = holdCleanup();
  pending = undefined;
  try {
    pending = h.app.exporter.write(["exported.md"], formatFor("docx")!, join(root, "cancelled.docx"));
    for (const t = Date.now(); !publishing && Date.now() - t < 25_000; ) await Bun.sleep(10);
    h.app.run("note.export_cancel");
    await hold.begun();
    expect(h.app.messages.at(-1)).toMatchObject({ level: "info", text: "export cancelled" });
    h.app.run("note.export_cancel");
    expect(h.app.messages.at(-1)).toMatchObject({ level: "info", text: "no export is running" });
  } finally {
    h.app.exporter.cancel(true);
    hold.release();
    await pending;
    hold.restore();
    PreparedExport.prototype.publish = publish;
  }
});

test("an export that can't be written isn't kept as where you exported last", async () => {
  const root = makeVault();
  writeFileSync(join(root, "exported.md"), "# Export\n\nOne\n");
  mkdirSync(join(root, "ro"));
  const h = await harness({ root, open: "exported.md" });
  chmodSync(join(root, "ro"), 0o555);
  try {
    await h.app.exporter.write(["exported.md"], formatFor("docx")!, join(root, "ro", "exported.docx"));
  } finally {
    chmodSync(join(root, "ro"), 0o755);
  }
  expect(h.app.messages.at(-1)?.text).toStartWith("export: ro/exported.docx not written — ");
  // The export over, its staging cleared: nothing kept.
  expect(h.app.exporter.lastDir()).toBeNull();
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

test("a real export restarted from background work stops the first and publishes its replacement", async () => {
  const root = makeVault();
  writeFileSync(join(root, "exported.md"), "# Export\n\nOne\n");
  const h = await harness({ root, open: "exported.md" });
  const target = join(root, "restarted.html");
  const prepare = ExportJob.prototype.prepare;
  let calls = 0;
  ExportJob.prototype.prepare = function (request, options) {
    if (++calls > 1) return prepare.call(this, request, options);
    return new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("export cancelled")), { once: true });
    });
  };
  try {
    const pending = h.app.exporter.write(["exported.md"], formatFor("html")!, target);
    const id = [...h.app.background.tasks.keys()][0]!;
    await h.app.run(`background.restart ${id}`);
    await pending;
    for (let i = 0; i < 500 && h.app.background.tasks.size; i++) await Bun.sleep(10);
    expect(calls).toBe(2);
    expect(readFileSync(target, "utf8")).toContain("One");
    expect(h.app.background.recent.map((task) => task.outcome)).toEqual(["done", "stopped"]);
  } finally {
    ExportJob.prototype.prepare = prepare;
  }
});
