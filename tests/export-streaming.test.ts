import { afterEach, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EXPORT_CHUNK, ExportSpool, PreparedExport, fileSink } from "../src/core/export/spool.ts";
import { utf8 } from "../src/core/export/stream.ts";
import type { ExportDoc } from "../src/core/export/assemble.ts";
import { assemble } from "../src/core/export/assemble.ts";
import { prepareExport } from "../src/core/export/jobs.ts";
import { formatFor, exportNotes, exportTarget, isExport } from "../src/core/export/index.ts";
import { DEFAULT_CONFIG } from "../src/core/application/config/config.ts";
import { Graph } from "../src/core/workspace/graph/graph.ts";
import { locateVault } from "../src/core/workspace/vaults/vault.ts";
import { readText } from "../src/core/foundation/platform/fsutil.ts";

// Exports stage in slipbox's cache folder: this file's, never the developer's.
process.env.XDG_CACHE_HOME = fs.mkdtempSync(join(tmpdir(), "export-streaming-cache-"));
const exportsDir = join(process.env.XDG_CACHE_HOME, "slipbox", "exports");

const dirs: string[] = [];
const own = (dir: string) => (dirs.push(dir), dir);
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function vault() {
  const dir = own(fs.mkdtempSync(join(tmpdir(), "export-streaming-")));
  fs.mkdirSync(join(dir, ".slipbox"));
  fs.writeFileSync(join(dir, "a.md"), "# First\n\nA [link](b.md#target).\n\n![[picture.png]]\n");
  fs.writeFileSync(join(dir, "b.md"), "# Second\n\n## Target\n\nWords and 😀.\n");
  // Large but header-valid PNG: Markdown copies its complete contents, without decoding it.
  const picture = Buffer.alloc(4 * EXPORT_CHUNK);
  picture.set([137, 80, 78, 71, 13, 10, 26, 10]);
  picture.writeUInt32BE(1, 16);
  picture.writeUInt32BE(1, 20);
  fs.writeFileSync(join(dir, "picture.png"), picture);
  const graph = new Graph(locateVault({ root: dir }), DEFAULT_CONFIG).build(false);
  return { dir, graph };
}

test("UTF-8 output windows are bounded and never split Unicode pairs", () => {
  const text = `${"a".repeat(Math.floor(EXPORT_CHUNK / 3) - 1)}😀é${"漢".repeat(EXPORT_CHUNK)}`;
  const parts: Buffer[] = [];
  utf8(text, (part) => {
    expect(part.length).toBeLessThanOrEqual(EXPORT_CHUNK);
    parts.push(Buffer.from(part));
  });
  expect(Buffer.concat(parts).toString()).toBe(text);
});

test("a file sink bounds writes even when an encoder emits one giant chunk", () => {
  const dir = own(fs.mkdtempSync(join(tmpdir(), "export-sink-")));
  const write = fs.writeSync;
  let largest = 0;
  const spy = spyOn(fs, "writeSync").mockImplementation(((
    fd: number,
    data: Uint8Array,
    offset: number,
    length: number,
  ) => {
    largest = Math.max(largest, length);
    // Real short writes exercise the sink's loop as well.
    return write(fd, data, offset, Math.min(777, length));
  }) as typeof fs.writeSync);
  const sink = fileSink(join(dir, "output"));
  try {
    sink.write(new Uint8Array(5 * EXPORT_CHUNK + 7).fill(42));
  } finally {
    sink.close();
    spy.mockRestore();
  }
  expect(largest).toBe(EXPORT_CHUNK);
  expect(fs.readFileSync(join(dir, "output"))).toEqual(Buffer.alloc(5 * EXPORT_CHUNK + 7, 42));
});

test("staged Markdown returns only a manifest, copies attachments and preserves output exactly", async () => {
  const { dir, graph } = vault();
  const target = join(dir, "book.export.md");
  const before = await exportNotes(graph, ["a.md", "b.md"], formatFor("md")!, target);
  const prepared = await prepareExport(graph, ["a.md", "b.md"], "md", target);
  try {
    expect(Object.keys(prepared.manifest).sort()).toEqual(["bytes", "files"]);
    expect(fs.existsSync(target)).toBe(false);
    expect(prepared.manifest.bytes).toBe(before.data.length);
    expect(prepared.manifest.files).toEqual(before.files.map((file) => ({ path: file.path, bytes: file.data.length })));
    const written = await prepared.publish(target, () => {
      exportTarget(graph, "a.md", formatFor("md")!, target, dir);
    });
    expect(fs.readFileSync(target)).toEqual(Buffer.from(before.data));
    expect(fs.readFileSync(written[0]!)).toEqual(Buffer.from(before.files[0]!.data));
    if (process.platform !== "win32") {
      expect(fs.statSync(prepared.dir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(join(prepared.dir, "document")).mode & 0o777).toBe(0o600);
    }
  } finally {
    await prepared.dispose();
  }
  expect(fs.existsSync(prepared.dir)).toBe(false);
});

test("publication yields to cancellation before replacing the destination and removes all temporary files", async () => {
  const dir = own(await PreparedExport.directory());
  const targetDir = own(fs.mkdtempSync(join(tmpdir(), "export-dest-")));
  const target = join(targetDir, "document.html");
  fs.writeFileSync(target, "old document", { mode: 0o640 });
  const spool = new ExportSpool(dir);
  await spool.document(async (sink) => {
    for (let i = 0; i < 512; i++) sink(new Uint8Array(EXPORT_CHUNK));
  });
  const prepared = await PreparedExport.take(dir, spool.manifest);
  const abort = new AbortController();
  const pending = prepared.publish(target, () => {}, abort.signal);
  setImmediate(() => abort.abort());
  await expect(pending).rejects.toThrow();
  expect(fs.readFileSync(target, "utf8")).toBe("old document");
  expect(fs.readdirSync(targetDir)).toEqual(["document.html"]);
  await prepared.dispose();
});

test("publication says when a cancel can no longer stop it: once, as the document's rename begins; never when it doesn't get there", async () => {
  const dir = own(await PreparedExport.directory());
  const dest = own(fs.mkdtempSync(join(tmpdir(), "export-commit-")));
  const target = join(dest, "report.md");
  const spool = new ExportSpool(dir);
  await spool.document(async (sink) => sink(new TextEncoder().encode("new")));
  spool.attachment("picture.png", (sink) => sink(new Uint8Array([1, 2, 3])));
  const prepared = await PreparedExport.take(dir, spool.manifest);
  try {
    // Told after the picture is in place, the document not yet; the signal never read again.
    const told: string[][] = [];
    const abort = new AbortController();
    await prepared.publish(
      target,
      () => {},
      abort.signal,
      () => {
        told.push(
          fs
            .readdirSync(dest)
            .filter((f) => !f.endsWith(".tmp"))
            .sort(),
        );
        abort.abort();
      },
    );
    expect(told).toEqual([["picture.png"]]);
    expect(fs.readFileSync(target, "utf8")).toBe("new");
    // Stopped before it gets there, or its target refused on the way: never told.
    let never = 0;
    const stopped = new AbortController();
    stopped.abort();
    await expect(
      prepared.publish(
        target,
        () => {},
        stopped.signal,
        () => never++,
      ),
    ).rejects.toThrow();
    let checks = 0;
    await expect(
      prepared.publish(
        target,
        () => {
          if (++checks === 2) throw Error("destination changed");
        },
        undefined,
        () => never++,
      ),
    ).rejects.toThrow("changed");
    expect(never).toBe(0);
  } finally {
    await prepared.dispose();
  }
});

test("destination policy is checked again after copying, before any document is replaced", async () => {
  const dir = own(await PreparedExport.directory());
  const dest = own(fs.mkdtempSync(join(tmpdir(), "export-race-")));
  const target = join(dest, "report.html");
  fs.writeFileSync(target, "original");
  const spool = new ExportSpool(dir);
  await spool.document(async (sink) => sink(new TextEncoder().encode("new")));
  const prepared = await PreparedExport.take(dir, spool.manifest);
  let checked = 0;
  try {
    await expect(
      prepared.publish(target, () => {
        if (++checked > 1) throw Error("destination changed");
      }),
    ).rejects.toThrow("changed");
    expect(fs.readFileSync(target, "utf8")).toBe("original");
    expect(fs.readdirSync(dest)).toEqual(["report.html"]);
  } finally {
    await prepared.dispose();
  }
});

test("streamed HTML matches buffered output and EPUB/PDF/Word remain recognizable exports", async () => {
  const { dir, graph } = vault();
  // Unreadable picture is intentionally left as its words by the renderers, as in the buffered path.
  const doc = await assemble(graph, ["b.md"]);
  const html = await formatFor("html")!.write(doc, join(dir, "buffered.html"));
  for (const format of ["html", "epub", "pdf", "docx"]) {
    const target = join(dir, `result.${format}`);
    const prepared = await prepareExport(graph, ["b.md"], format, target);
    try {
      await prepared.publish(target, () => {});
      expect(isExport(target)).toBe(true);
      if (format === "html") expect(readText(target).text).toBe(new TextDecoder().decode(html.data));
    } finally {
      await prepared.dispose();
    }
  }
});

test("invalid or incomplete manifests never become prepared output", async () => {
  const dir = own(await PreparedExport.directory());
  for (const value of [
    { bytes: -1, files: [] },
    { bytes: 0, files: [{ path: "../note.md", bytes: 0 }] },
    { bytes: 0, files: [{ path: "/note.md", bytes: 0 }] },
  ])
    await expect(PreparedExport.take(dir, value)).rejects.toThrow("invalid");
  fs.writeFileSync(join(dir, "document"), "short");
  await expect(PreparedExport.take(dir, { bytes: 10, files: [] })).rejects.toThrow("incomplete");
});

test("a streamed PDF releases completed pages rather than retaining the whole book", async () => {
  const PDFDocument = (await import("pdfkit")).default;
  const { toPdf } = await import("../src/core/export/pdf.ts");
  const { findFonts } = await import("../src/core/export/fonts.ts");
  const doc: ExportDoc = {
    title: "Pages",
    author: null,
    date: null,
    lang: null,
    chapters: [
      {
        rel: "pages.md",
        anchor: "pages",
        title: "Pages",
        nodes: Array.from({ length: 600 }, (_, i) => ({
          type: "paragraph" as const,
          children: [{ type: "text" as const, value: `Paragraph ${i}. ${"Some words. ".repeat(25)}` }],
        })),
      },
    ],
  };
  const flush = PDFDocument.prototype.flushPages;
  let peakPages = 0;
  let flushed = 0;
  const spy = spyOn(PDFDocument.prototype, "flushPages").mockImplementation(function (this: PDFKit.PDFDocument) {
    const pages = this.bufferedPageRange().count;
    peakPages = Math.max(peakPages, pages);
    flushed += pages;
    return flush.call(this);
  });
  let bytes = 0;
  try {
    await toPdf(doc, findFonts(new Map()), (chunk) => {
      bytes += chunk.length;
    });
  } finally {
    spy.mockRestore();
  }
  expect(flushed).toBeGreaterThan(10);
  expect(peakPages).toBeLessThanOrEqual(1);
  expect(bytes).toBeGreaterThan(10_000);
});

test("a staged note past 8 MiB keeps its complete contents", async () => {
  const { dir, graph } = vault();
  const text = `# Large\n\n${"ordinary text ".repeat(700_000)}\n\n![[picture.png]]\n`;
  fs.writeFileSync(join(dir, "a.md"), text);
  graph.build(false);
  const target = join(dir, "large.export.md");
  const prepared = await prepareExport(graph, ["a.md"], "md", target);
  try {
    expect(prepared.manifest.bytes).toBeGreaterThan(8 * 1024 * 1024);
    await prepared.publish(target, () => {});
    expect(fs.readFileSync(target, "utf8")).toContain("ordinary text ".repeat(20));
    expect(fs.statSync(target).size).toBe(prepared.manifest.bytes);
  } finally {
    await prepared.dispose();
  }
});

test("cancelling worker preparation removes its private partial output", async () => {
  const { ExportJob } = await import("../src/core/export/jobs.ts");
  let asked: { spool: string } | undefined;
  const worker = {
    onmessage: null as ((event: unknown) => void) | null,
    onerror: null,
    onmessageerror: null,
    postMessage(request: { spool: string }) {
      asked = request;
    },
    terminate() {},
  };
  const abort = new AbortController();
  const pending = new ExportJob(() => worker as unknown as Worker).prepare({} as never, { signal: abort.signal });
  while (!worker.onmessage) await Bun.sleep(1);
  worker.onmessage({ data: { ready: true } });
  fs.writeFileSync(join(asked!.spool, "document"), "partial private output");
  abort.abort();
  await expect(pending).rejects.toThrow("cancelled");
  expect(fs.existsSync(asked!.spool)).toBe(false);
});

test.skipIf(process.platform === "win32")(
  "CLI termination cancels preparation and removes staging before the signal ends it",
  async () => {
    const { dir } = vault();
    fs.writeFileSync(join(dir, "a.md"), `# Long\n\n${"Some paragraphs for a long PDF.\n\n".repeat(10000)}`);
    const temporary = join(dir, "tmp");
    fs.mkdirSync(temporary);
    const target = join(dir, "cancelled.pdf");
    const child = Bun.spawn(
      [
        process.execPath,
        new URL("../src/main.ts", import.meta.url).pathname,
        "export",
        join(dir, "a.md"),
        "--to",
        "pdf",
        "--out",
        target,
      ],
      {
        cwd: dir,
        env: {
          ...process.env,
          TMPDIR: temporary,
          XDG_CACHE_HOME: join(dir, "cache"),
          XDG_STATE_HOME: join(dir, "state"),
          XDG_CONFIG_HOME: join(dir, "config"),
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    // Staged in its cache folder's `exports/`, named by its process.
    const exports = join(dir, "cache", "slipbox", "exports");
    const staged = () => fs.existsSync(exports) && fs.readdirSync(exports).some((p) => p.startsWith(`${child.pid}-`));
    try {
      for (const start = Date.now(); !staged() && Date.now() - start < 15000; ) await Bun.sleep(5);
      expect(staged()).toBe(true);
      expect(fs.readdirSync(temporary)).toEqual([]);
      child.kill("SIGTERM");
      expect(await Promise.race([child.exited, Bun.sleep(5000).then(() => "still running")])).toBe(143);
      expect(staged()).toBe(false);
      expect(fs.existsSync(target)).toBe(false);
    } finally {
      child.kill("SIGKILL");
      await child.exited;
    }
  },
);

test("normal process exit removes private staging without waiting for an async disposer", async () => {
  const module = new URL("../src/core/export/spool.ts", import.meta.url).href;
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `const {PreparedExport,ExportSpool}=await import(${JSON.stringify(module)}); const dir=await PreparedExport.directory(); const spool=new ExportSpool(dir); await spool.document(async sink=>sink(new Uint8Array([1,2,3]))); console.log(dir); process.exit(0);`,
    ],
    { env: { ...process.env }, stdout: "pipe", stderr: "pipe" },
  );
  const dir = (await new Response(child.stdout).text()).trim();
  expect(await child.exited).toBe(0);
  expect(dir.startsWith(join(exportsDir, `${child.pid}-`))).toBe(true);
  expect(fs.existsSync(dir)).toBe(false);
});

test("staging left by a process that's gone is removed when the next export stages; a running one's stays", async () => {
  const cache = own(fs.mkdtempSync(join(tmpdir(), "export-sweep-")));
  const exports = join(cache, "slipbox", "exports");
  const gone = Bun.spawn([process.execPath, "-e", "0"]);
  await gone.exited;
  fs.mkdirSync(join(exports, `${gone.pid}-left`), { recursive: true });
  fs.writeFileSync(join(exports, `${gone.pid}-left`, "document"), "a killed export's output");
  fs.mkdirSync(join(exports, `${process.pid}-running`));
  const module = new URL("../src/core/export/spool.ts", import.meta.url).href;
  const child = Bun.spawn(
    [process.execPath, "-e", `await (await import(${JSON.stringify(module)})).PreparedExport.directory();`],
    { env: { ...process.env, XDG_CACHE_HOME: cache }, stdout: "pipe", stderr: "pipe" },
  );
  expect(await child.exited).toBe(0);
  expect(fs.readdirSync(exports)).toEqual([`${process.pid}-running`]);
});

test("streamed PDF quotes and nested callouts continue across released pages", async () => {
  const { toPdf } = await import("../src/core/export/pdf.ts");
  const { findFonts } = await import("../src/core/export/fonts.ts");
  const paragraphs = Array.from({ length: 150 }, (_, i) => ({
    type: "paragraph" as const,
    children: [{ type: "text" as const, value: `Quoted ${i}. ${"Many quoted words. ".repeat(20)}` }],
  }));
  const doc: ExportDoc = {
    title: "Quotes",
    author: null,
    date: null,
    lang: null,
    chapters: [
      {
        rel: "quotes.md",
        anchor: "quotes",
        title: "Quotes",
        nodes: [
          {
            type: "blockquote",
            children: [...paragraphs, { type: "blockquote", children: paragraphs.slice(0, 20) }, ...paragraphs],
          },
        ],
      },
    ],
  };
  let bytes = 0;
  await toPdf(doc, findFonts(new Map()), (chunk) => {
    bytes += chunk.length;
  });
  expect(bytes).toBeGreaterThan(10_000);
});
