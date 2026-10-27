import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { locationItems } from "../../../../../src/tui/shell/screen/topbar/location.ts";
import { whereOf } from "../../../../../src/tui/shell/screen/topbar/where.ts";
import type { LocationContext } from "../../../../../src/tui/shell/screen/topbar/contracts.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

const sandbox = makeCoreSandbox();
const fixture = (): LocationContext => ({
  loc: { mode: "vault", name: "work", root: sandbox },
  homeFolder: null,
  explorer: { top: "/example/zoom" },
  glyphs: { gitAhead: "+", gitBehind: "-", explorerButton: "E", vault: "V", branch: "B", changed: "C" },
  git: { checkout: null, generation: 0, branch: () => "topic", track: null, entries: null },
  now: () => 0,
});

describe("location selectors from explicit data capabilities", () => {
  test("vault, branch and distinct changed paths keep independent item identities", () => {
    const host = fixture();
    const context = { ...host, git: { ...host.git, entries: [{ path: "a.md" }, { path: "a.md" }, { path: "b.md" }] } };
    expect(locationItems(context)).toEqual([
      { text: "E /example/zoom", id: "top:zoom", role: "topbar" },
      { text: "V work", id: "top:vault", role: "topbar" },
      { text: "B topic", compact: "B topic", id: "top:branch", role: "status_dim" },
      { text: "C 2", id: "top:changed", role: "git_modified" },
    ]);
  });

  test("Elsewhere suppresses branch and operation reads even when Git data is present", () => {
    const host = fixture();
    const context: LocationContext = {
      ...host,
      loc: { ...host.loc, mode: "folder" },
      git: {
        ...host.git,
        branch: () => {
          throw new Error("Elsewhere has no branch read");
        },
      },
      now: () => {
        throw new Error("Elsewhere has no operation read");
      },
    };
    expect(whereOf(context)).toEqual({ vault: "Elsewhere", branch: null, track: "", op: "" });
    expect(locationItems(context).map((item) => item.id)).toEqual(["top:zoom", "top:vault"]);
  });

  test("workspace label stays independent of zoom and branch text is sanitized", () => {
    const host = fixture();
    const context = { ...host, homeFolder: "workspace", git: { ...host.git, branch: () => "topic\u001b[31m" } };
    const items = locationItems(context);
    expect(items[0]!.text).toBe("E /example/zoom");
    expect(items[1]!.text).toBe("V workspace");
    expect(items[2]!.text).toBe("B topic");
  });

  test("a rebase branch wins over detached HEAD and upstream counts match that branch only", () => {
    const host = fixture();
    const gitDir = join(sandbox, "git");
    mkdirSync(join(gitDir, "rebase-merge"), { recursive: true });
    writeFileSync(join(gitDir, "rebase-merge", "head-name"), "refs/heads/rebased\n");
    writeFileSync(join(gitDir, "rebase-merge", "msgnum"), "2\n");
    writeFileSync(join(gitDir, "rebase-merge", "end"), "5\n");
    const context = {
      ...host,
      git: {
        ...host.git,
        checkout: { gitDir },
        branch: () => null,
        track: { branch: "rebased", upstream: "origin/rebased", ahead: 2, behind: 1, gone: false },
      },
    };
    expect(whereOf(context)).toEqual({ vault: "work", branch: "rebased", track: "+2 -1", op: "rebasing 2/5" });
    expect(whereOf({ ...context, git: { ...context.git, track: { ...context.git.track, branch: "old" } } }).track).toBe(
      "",
    );
  });
});
