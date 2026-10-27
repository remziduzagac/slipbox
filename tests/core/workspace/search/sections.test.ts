import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("search's sections, cut to scout's size band (scout's Stage 4)", () => {
  /** A paragraph of `bytes` bytes (ASCII), a word given to find it by. */
  const para = (bytes: number, word = "filler") => `${word} ${"lorem ".repeat(Math.ceil(bytes / 6))}`.slice(0, bytes);
  test("each node on its own tokens: kept in the band, merged up when under — the root always kept — split when over", async () => {
    const { indexDoc, BAND_MAX } = await import("../../../../src/core/workspace/search/search.ts");
    const text = [
      "---",
      "title: T",
      "---",
      "lead text",
      "",
      "# Auth",
      "",
      "short",
      "",
      "## How auth works",
      "",
      "short too",
      "",
      "### Cookies",
      "",
      "cookies here",
      "",
      "## Redirects",
      "",
      para(2000, "redirects"),
      "",
      "## Big",
      "",
      ...Array.from({ length: 7 }, (_, i) => [para(1000, `big${i}`), ""]).flat(),
      "## Data",
      "",
      para(2000, "first"),
      "",
      "## data",
      "",
      para(2000, "second"),
      "",
      "## a/b#c%d~e",
      "",
      para(2000, "odd"),
      "",
      "## Fenced",
      "",
      "```",
      para(1500, "code1"),
      "",
      para(1500, "code2"),
      "",
      para(1500, "code3"),
      "",
      para(1500, "code4"),
      "```",
    ].join("\n");
    const d = indexDoc("auth.md", text, "note");
    const names = d.sections.map((x) => x.name);
    expect(names).toEqual([
      "§:file",
      "Auth/Redirects",
      "Auth/Big/§:part",
      "Auth/Big/§:part~2",
      "Auth/Data",
      "Auth/data~2",
      "Auth/a%2Fb%23c%25d%7Ee",
      "Auth/Fenced/§:part",
      "Auth/Fenced/§:part~2",
    ]);
    // Auth, How auth works and Cookies are each under the band: Cookies into How auth works, that into
    // Auth, Auth into the root — which is kept though it's still under.
    const root = d.sections[0]!;
    expect(root.lines.map((l) => l.text)).toEqual(
      expect.arrayContaining(["lead text", "# Auth", "### Cookies", "cookies here"]),
    );
    expect(root.tokens).toBeLessThan(400);
    // A section's range is its first and last line, merged text and all.
    expect([root.line, root.end]).toEqual([1, 17]); // Cookies' blank line after its text, its own
    // Big is over the band: cut at paragraphs, each piece in it.
    for (const piece of d.sections.filter((x) => x.name.startsWith("Auth/Big/")))
      expect(piece.tokens).toBeLessThanOrEqual(BAND_MAX);
    // A fenced block is one unit, never cut: over the band, it's a piece of its own, kept whole and said
    // so — its heading, packed first, a piece before it (scout's rule, as written).
    const fenced = d.sections.find((x) => x.name === "Auth/Fenced/§:part~2")!;
    expect(fenced.oversized).toBe(true);
    expect(fenced.lines.map((l) => l.text).filter((t) => t.startsWith("code")).length).toBe(4);
    expect(d.sections.find((x) => x.name === "Auth/Fenced/§:part")!.lines.map((l) => l.text)).toEqual(["## Fenced"]);
  });

  test("a split's last piece under the band's bottom goes onto the one before", async () => {
    const { indexDoc } = await import("../../../../src/core/workspace/search/search.ts");
    const text = [
      "# Tail",
      "",
      ...Array.from({ length: 6 }, (_, i) => [para(1000, `p${i}`), ""]).flat(),
      para(200, "last"),
    ].join("\n");
    const d = indexDoc("tail.md", text, "note");
    expect(d.sections.map((x) => x.name).sort()).toEqual(["Tail/§:part", "§:file"]);
    expect(d.sections.find((x) => x.name === "Tail/§:part")!.lines.at(-1)!.text).toStartWith("last");
  });

  test("a data file with no headings: one section, or band-sized chunks at blank lines", async () => {
    const { indexDoc } = await import("../../../../src/core/workspace/search/search.ts");
    expect(indexDoc("a.yaml", "a: 1\nb: 2\n", "data").sections.map((x) => x.name)).toEqual(["§:file"]);
    const big = Array.from({ length: 8 }, (_, i) => para(1000, `k${i}:`)).join("\n\n");
    expect(indexDoc("big.yaml", big, "data").sections.map((x) => x.name)).toEqual(["§:chunk", "§:chunk~2"]);
  });

  test("a hit names its section and range, as scout would, for a search that adds scout's results to dedupe on", async () => {
    const { search } = await import("../../../../src/core/workspace/search/search.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-band-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "n.md"), `# N\n\nintro\n\n## Deep\n\n${para(2000, "needle")}\n`);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const hit = search(g, null, "needle").hits[0]!;
    expect(hit).toMatchObject({ path: "n.md", line: 7, heading: "Deep", section: { name: "N/Deep", line: 5, end: 7 } });
  });
});
