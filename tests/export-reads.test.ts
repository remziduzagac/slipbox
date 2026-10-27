import { TEST_BUDGETS } from "./support/timeouts.ts";
// What an export reads and keeps (src/core/export/reads.ts): every note and picture whole, however big — the size of a
// note, a picture, all of them together or the document made of them refuses nothing; each note parsed once.
import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../src/core/application/config/config.ts";
import { openGraph } from "../src/core/workspace/graph/graph.ts";
import { locateVault } from "../src/core/workspace/vaults/vault.ts";
import { exportNotes, formatFor } from "../src/core/export/index.ts";
import { rasterInfo, rasterOf } from "../src/core/export/images.ts";
import { exportGraph } from "../src/core/export/jobs.ts";

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-export-reads-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));
// Notes past 8 MiB and pages of photos, exported through a worker: slow on a loaded machine, not stuck.
setDefaultTimeout(TEST_BUDGETS.exportReads);
// The cache (the index, the web's pictures) and state in the sandbox: the export's worker sees them there too.
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_STATE_HOME = join(sandbox, "state");

const MiB = 1024 * 1024;

/** A vault of `files`, its graph. */
function vault(files: Record<string, string | Uint8Array>, cache = false) {
  const root = mkdtempSync(join(sandbox, "vault-"));
  mkdirSync(join(root, ".slipbox"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return { root, graph: openGraph(locateVault({ root }), DEFAULT_CONFIG, cache, "lazy") };
}

/** A PNG's header saying `width` × `height`, the file `bytes` long (the rest zeros): a picture by what it says. */
function png(width: number, height: number, bytes = 64): Uint8Array {
  const b = new Uint8Array(bytes);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

/** The names in a ZIP (a Word file), from its central directory. */
function zipNames(z: Uint8Array): string[] {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const names: string[] = [];
  for (let p = 0; p + 46 <= z.length; p++)
    if (v.getUint32(p, true) === 0x02014b50) {
      const len = v.getUint16(p + 28, true);
      names.push(new TextDecoder().decode(z.subarray(p + 46, p + 46 + len)));
    }
  return names;
}

test("a note past 8 MiB is exported whole", async () => {
  // A log kept as a note, in a code block, past 8 MiB: long lines, quick to parse (as many short ones take a slow
  // machine a minute).
  const r = vault({ "large.md": `# Log\n\n\`\`\`\n${`${"text ".repeat(200)}\n`.repeat(9_000)}\`\`\`\n` });
  const out = await exportNotes(r.graph, ["large.md"], formatFor("md")!, join(r.root, "large.export.md"));
  expect(out.data.byteLength).toBeGreaterThan(8 * MiB);
});

test("a document past 64 MiB once serialized is exported whole: a log of control characters, six each escaped", async () => {
  const r = vault({ "log.md": `# Log\n\n\`\`\`\n${"\u0001".repeat(6 * MiB)}\n\`\`\`\n` });
  const out = await exportNotes(r.graph, ["log.md"], formatFor("md")!, join(r.root, "log.export.md"));
  expect(out.data.byteLength).toBeGreaterThan(6 * MiB);
});

test("a picture past 20 MiB, and one taller than 32,768 pixels, are copied beside a Markdown export", async () => {
  const r = vault({
    "a.md": "# A\n\n![photo](photo.png) ![the whole page](page.png)\n",
    "photo.png": png(8000, 6000, 21 * MiB),
    "page.png": png(1280, 36_000),
  });
  const out = await exportNotes(r.graph, ["a.md"], formatFor("md")!, join(r.root, "a.export.md"));
  expect(out.files.map((f) => [f.path, f.data.byteLength])).toEqual([
    ["a.export.assets/photo.png", 21 * MiB],
    ["a.export.assets/page.png", 64],
  ]);
});

test("pictures read past 128 MiB together are all in the document: a Word file of seven 10 MiB photos", async () => {
  const files: Record<string, Uint8Array | string> = {};
  let note = "# Trip\n\n";
  for (let i = 0; i < 7; i++) {
    const photo = png(4000, 3000, 10 * MiB);
    photo[photo.length - 1] = i + 1;
    files[`photos/${i}.png`] = photo;
    note += `![day ${i}](photos/${i}.png)\n\n`;
  }
  const r = vault({ ...files, "trip.md": note });
  const out = await exportNotes(r.graph, ["trip.md"], formatFor("docx")!, join(r.root, "trip.docx"));
  expect(zipNames(out.data).filter((n) => n.startsWith("word/media/") && !n.endsWith("/"))).toHaveLength(7);
});

test("pictures of any size are pictures; an SVG is rasterised however many pixels it takes", () => {
  expect(rasterInfo(png(10_000, 10_000))).toEqual({ type: "png", width: 10_000, height: 10_000 });
  expect(rasterInfo(png(1280, 40_000))).toEqual({ type: "png", width: 1280, height: 40_000 });
  // A header saying no size is no picture.
  expect(rasterInfo(png(0, 100))).toBeNull();
  let rasterized = false;
  const result = rasterOf(
    { svg: '<svg width="600" height="9000"/>' },
    {
      family: null,
      size: () => ({ width: 600, height: 9000 }),
      png: (_svg, width) => {
        rasterized = true;
        return png(width, width * 15);
      },
    },
    600,
    ["png"],
    2,
  );
  expect(rasterized).toBe(true);
  expect(result).toMatchObject({ type: "png", width: 1200, height: 18_000 });
});

test("a chapter's transformed links never mutate the parsed source later used by an embed", async () => {
  const { assemble } = await import("../src/core/export/assemble.ts");
  const r = vault({ "a.md": "# A\n\n[go to B](b.md)\n", "b.md": "# B\n\n![[a]]\n" });
  const doc = await assemble(r.graph, ["a.md", "b.md"]);
  const links: string[] = [];
  const walk = (nodes: unknown[]) => {
    for (const node of nodes as { type: string; url?: string; children?: unknown[] }[]) {
      if (node.type === "link") links.push(node.url!);
      if (node.children) walk(node.children);
    }
  };
  walk(doc.chapters[1]!.nodes);
  expect(links).toEqual(["#b"]);
});

test("an embedded note that can't be read stays its name, and the export goes on", async () => {
  const { assemble } = await import("../src/core/export/assemble.ts");
  const r = vault({ "main.md": "# Main\n\nBefore.\n\n![[locked]]\n\nAfter.\n", "locked.md": "# Locked\n\nPrivate.\n" });
  chmodSync(join(r.root, "locked.md"), 0o000);
  try {
    const doc = await assemble(r.graph, ["main.md"]);
    const text = JSON.stringify(doc.chapters[0]!.nodes);
    expect(text).toContain("Before.");
    expect(text).toContain("After.");
    expect(text).not.toContain("Private.");
  } finally {
    chmodSync(join(r.root, "locked.md"), 0o644);
  }
});

test("the export's graph reads the vault's index as its owner's does: notes parsed already aren't parsed again", () => {
  const notes: Record<string, string> = {};
  for (let i = 0; i < 20; i++) notes[`n${i}.md`] = `---\naliases: [Topic ${i}]\n---\n# N${i}\n`;
  const r = vault(notes, true);
  r.graph.ensureAll();
  const request = {
    loc: r.graph.loc,
    config: r.graph.config,
    asked: [],
    thorough: true,
    cache: r.graph.usesCache,
    reach: false,
    names: [],
    rels: [],
    format: "md",
    target: "",
  };
  expect(exportGraph(request).stats).toMatchObject({ notes: 20, cached: 20 });
  // A graph that keeps no index: nor does the export's.
  expect(exportGraph({ ...request, cache: false }).stats).toMatchObject({ notes: 20, cached: 0 });
});
