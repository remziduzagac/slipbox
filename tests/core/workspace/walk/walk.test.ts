import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";

import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { LINK_REASON } from "../../../../src/core/workspace/walk/walk.ts";
import { VAULT, makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("the walk (0.11)", () => {
  const g = openGraph(locateVault({ root: VAULT }), DEFAULT_CONFIG, false);
  const cfg = structuredClone(DEFAULT_CONFIG);
  cfg.walk.exclude = ["drafts/"];
  const withVaultCfg = openGraph(locateVault({ root: VAULT }), cfg, false);
  const notes = [...withVaultCfg.notes.keys()];
  test("skips node_modules, .gitignore'd paths, dotdirs, nested vaults and walk.exclude", () => {
    expect(notes.some((n) => n.startsWith("node_modules/"))).toBe(false);
    expect(notes).not.toContain("ignored/secret.md");
    expect(notes).not.toContain("notes/temp.skip.md");
    expect(notes.some((n) => n.startsWith(".hidden"))).toBe(false);
    expect(notes.some((n) => n.startsWith("nested-vault"))).toBe(false);
    expect(notes).not.toContain("drafts/wip.md");
    expect([...g.notes.keys()]).toContain("drafts/wip.md");
  });
  test("symlinks: a duplicate of a walked note no, outside no, directories never followed", () => {
    expect(notes).not.toContain("alias-link.md"); // -> notes/alpha.md, already a note
    expect(notes).not.toContain("outside-link.md");
    expect(withVaultCfg.skipped.map((s) => s.rel)).toEqual(
      expect.arrayContaining(["alias-link.md", "outside-link.md", "symlinked-dir", "nested-vault"]),
    );
  });
  test("a symlink to an otherwise-excluded note inside the vault is kept", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-link-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, ".private"));
    writeFileSync(join(dir, ".private", "p.md"), "# p\n");
    require("node:fs").symlinkSync(".private/p.md", join(dir, "public.md"));
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect([...g.notes.keys()]).toEqual(["public.md"]);
  });
  test("a symlinked picture or data file: inside the root, listed and found by name; outside it, skipped and said (0.11)", async () => {
    const { WalkFilter, walkVault } = await import("../../../../src/core/workspace/walk/walk.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-link-asset-"));
    const outside = mkdtempSync(join(tmpdir(), "slipbox-link-asset-out-"));
    for (const d of [".slipbox", "shared", "img"]) mkdirSync(join(dir, d));
    writeFileSync(join(dir, "shared", "logo.png"), "png");
    writeFileSync(join(outside, "far.png"), "png");
    symlinkSync("../shared/logo.png", join(dir, "img", "brand.png"));
    symlinkSync(join(outside, "far.png"), join(dir, "out.png"));
    writeFileSync(join(dir, "a.md"), "![[brand.png]]\n");
    const walk = walkVault(dir, new WalkFilter(dir, DEFAULT_CONFIG.walk));
    expect(walk.assets.sort()).toEqual(["img/brand.png", "shared/logo.png"]);
    expect(walk.skipped).toContainEqual({
      rel: "out.png",
      reason: LINK_REASON.out,
      link: { target: realpathSync(join(outside, "far.png")), dir: false },
    });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(g.resolveLink({ kind: "embed", target: "brand.png" }, "a.md")).toMatchObject({
      resolvedKind: "file",
      path: "img/brand.png",
    });
  });
  test("encodings: CRLF, BOM, invalid UTF-8 and no trailing newline all parse", () => {
    expect(withVaultCfg.notes.get("crlf.md")!.flags).toContain("crlf");
    expect(withVaultCfg.notes.get("bom.md")!.title).toBe("BOM note");
    expect(withVaultCfg.notes.get("latin1.md")!.flags).toContain("invalid-utf8");
    expect(withVaultCfg.notes.get("no-newline.md")!.title).toBe("No trailing newline");
  });
  test("graph: links resolve, attachments by path, backlinks", () => {
    const links = withVaultCfg.linksOf("index.md");
    const byTarget = Object.fromEntries(links.map((l) => [l.target, l]));
    expect(byTarget["notes/beta.md"]!.path).toBe("notes/beta.md");
    expect(byTarget["notes/Readme.md"]!.path).toBe("notes/Readme.md");
    expect(byTarget["missing-note.md"]!.resolvedKind).toBe("unresolved");
    expect(byTarget["attachments/diagram.png"]!.path).toBe("attachments/diagram.png");
    expect(withVaultCfg.backlinks("notes/beta.md").map((b) => b.from)).toContain("index.md");
    expect(withVaultCfg.notes.get("cjk/日本語.md")!.links[0]!.target).toBe("../notes/alpha.md");
  });
});
