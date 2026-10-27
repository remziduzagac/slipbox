import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { cli } from "../../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("links to the repository's own hosting (trailscout's review)", () => {
  test("parsed: GitHub's blob, tree and raw; GitLab's /-/blob with groups; Bitbucket's src and #markdown-header-; a repository's page", async () => {
    const { parseHosted } = await import("../../../../src/core/workspace/links/hosting.ts");
    expect(parseHosted("https://github.com/me/repo/blob/main/docs/my%20plan.md#goals")).toEqual({
      remote: "github.com/me/repo",
      ref: "main",
      path: "docs/my plan.md",
      fragment: "goals",
      folder: false,
    });
    expect(parseHosted("https://github.com/me/repo/tree/v2/docs")).toMatchObject({
      ref: "v2",
      path: "docs",
      folder: true,
    });
    expect(parseHosted("https://GitLab.com/group/sub/proj/-/blob/main/x.md")).toMatchObject({
      remote: "gitlab.com/group/sub/proj",
      ref: "main",
      path: "x.md",
    });
    expect(parseHosted("https://bitbucket.org/team/repo/src/main/docs/x.md#markdown-header-goals")).toMatchObject({
      remote: "bitbucket.org/team/repo",
      path: "docs/x.md",
      fragment: "goals",
    });
    expect(parseHosted("https://github.com/me/repo.git#readme")).toEqual({
      remote: "github.com/me/repo",
      ref: null,
      path: "",
      fragment: null,
      folder: false,
    });
    expect(parseHosted("https://github.com/me/repo/issues/12")).toBeNull();
    // Encoded slashes never climb out of the copy: not a hosting link, an external one.
    expect(parseHosted("https://github.com/me/repo/blob/main/..%2F..%2Fsecret.md")).toBeNull();
    expect(parseHosted("https://github.com/me/repo/blob/main/docs%2F.%2Fplan.md")).toBeNull();
    expect(parseHosted("mailto:me@example.com")).toBeNull();
  });

  test("in a README: the file in this copy, a backlink; another ref said; another repository's a URL; renamed, the URL follows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-host-"));
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(dir, ".git", "config"), '[remote "origin"]\n\turl = git@github.com:Me/Repo.git\n');
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "plan.md"), "# Plan\n\n## Goals\n");
    const base = "https://github.com/me/repo";
    writeFileSync(
      join(dir, "README.md"),
      `# Repo\n\n[plan](${base}/blob/main/docs/plan.md#goals) [docs](${base}/tree/main/docs) [dev](${base}/blob/dev/docs/plan.md) [home](https://github.com/ME/Repo#readme) [else](https://github.com/them/other/blob/main/x.md) [gone](${base}/blob/main/gone.md)\n`,
    );
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const { certainty } = await import("../../../../src/core/workspace/graph/graph.ts");
    expect(g.linksOf("README.md").map((l) => [l.resolvedKind, l.path, l.via ?? null, certainty(l)])).toEqual([
      ["note", "docs/plan.md", "hosting", "exact"],
      ["folder", "docs", "hosting", "exact"],
      ["note", "docs/plan.md", "hosting", "inferred"],
      ["note", "README.md", "hosting", "exact"],
      ["external", "https://github.com/them/other/blob/main/x.md", null, "exact"],
      ["unresolved", null, "hosting", "broken"],
    ]);
    expect(g.backlinks("docs/plan.md").map((b) => b.from)).toEqual(["README.md", "README.md"]);
    const { landingLine } = await import("../../../../src/core/workspace/links/landing.ts");
    expect(landingLine(g, "docs/plan.md", "goals", null)).toBe(3);
    expect(landingLine(g, "docs/plan.md", "markdown-header-goals", null)).toBe(3);
    const { noteProblems } = await import("../../../../src/core/documents/diagnostics/diagnostics.ts");
    expect(noteProblems(g, "README.md").map((p) => [p.code, p.message])).toEqual([
      ["other-ref", `${base}/blob/dev/docs/plan.md names dev; this copy is on main`],
      ["unresolved", "no gone.md in this copy of github.com/me/repo"],
    ]);
    const r = JSON.parse(
      (await cli(["--root", dir, "resolve", `${base}/blob/main/docs/plan.md#goals`, "--json"])).out,
    ).data;
    expect(r).toMatchObject({ status: "resolved", path: "docs/plan.md", line: 3 });
    expect((await cli(["--root", dir, "mv", "docs/plan.md", "docs/road map.md"])).code).toBe(0);
    expect(readFileSync(join(dir, "README.md"), "utf8")).toContain(
      `[plan](${base}/blob/main/docs/road%20map.md#goals) [docs](${base}/tree/main/docs) [dev](${base}/blob/dev/docs/road%20map.md)`,
    );
  });

  test("another repository this machine knows by its remote (21.6): its file there", async () => {
    const { recordFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const tag = basename(mkdtempSync(join(tmpdir(), "h")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const other = mkdtempSync(join(tmpdir(), "slipbox-host-b-"));
    mkdirSync(join(other, ".git"));
    writeFileSync(join(other, ".git", "config"), `[remote "origin"]\n\turl = https://github.com/me/b${tag}\n`);
    writeFileSync(join(other, "n.md"), "# N\n");
    recordFolder(other);
    const dir = mkdtempSync(join(tmpdir(), "slipbox-host-a-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "a.md"), `[n](https://github.com/me/b${tag}/blob/main/n.md)\n`);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(g.linksOf("a.md")[0]).toMatchObject({ resolvedKind: "note", path: join(other, "n.md"), via: "hosting" });
  });
});
