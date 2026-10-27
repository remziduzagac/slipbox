import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("path links, as other tools write them (17.16)", () => {
  const io = (cwd: string) => {
    const out: string[] = [];
    return {
      io: {
        out: (s: string) => out.push(s),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd,
        env: process.env,
      },
      out,
    };
  };
  const cli = async (args: string[], cwd: string) => {
    const r = io(cwd);
    const code = await runCli([...args, "--json"], r.io);
    return { code, json: JSON.parse(r.out.join("")) };
  };
  // A home folder of its own, so `~/` means something known.
  const base = mkdtempSync(join(tmpdir(), "slipbox-paths-"));
  const notes = join(base, "notes");
  const app = join(base, "app");
  const before = process.env.HOME;
  const withHome = async <T>(f: () => Promise<T>): Promise<T> => {
    process.env.HOME = base;
    try {
      return await f();
    } finally {
      process.env.HOME = before;
    }
  };
  const write = (abs: string, text: string) => {
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, text);
  };
  write(join(notes, "todo.md"), "# Todo\n");
  write(
    join(notes, "index.md"),
    [
      "[rel](../app/design.md) [goals](../app/design.md#goals) ![pic](../app/pic.png)",
      "[home](~/app/design.md)",
      `[abs](${app}/design.md)`,
      `[url](file://${app}/design.md#goals)`,
      `[inside](${notes}/todo.md) [iu](file://${notes}/todo.md)`,
      "[spaced](<../app/my design.md>) [encoded](../app/my%20design.md)",
      "",
    ].join("\n\n"),
  );
  write(join(app, "design.md"), "# Design\n\n## Goals\n");
  write(join(app, "my design.md"), "# Spaced\n");
  write(join(app, "pic.png"), "png");
  write(join(app, "links.md"), `[r](../notes/todo.md) [t](~/notes/todo.md) [u](file://${notes}/todo.md)\n`);
  const ready = withHome(async () => {
    await cli(["init", notes, "--name", "pnotes"], notes);
    await cli(["init", app, "--name", "papp"], app);
    await cli(["ls"], app);
  });

  test("relative out of the root, ~/, absolute and file:// all reach the file; inside the vault, its note", async () => {
    await ready;
    const links = await withHome(async () => (await cli(["links", "index"], notes)).json.data);
    const at = (target: string) => links.find((l: { target: string }) => l.target === target);
    for (const t of [
      "../app/design.md",
      "../app/design.md#goals",
      "~/app/design.md",
      `${app}/design.md`,
      `file://${app}/design.md#goals`,
    ]) {
      expect(at(t)).toMatchObject({ status: "note", path: join(app, "design.md"), root: app, name: "papp" });
    }
    expect(at("../app/pic.png")).toMatchObject({ status: "file", path: join(app, "pic.png") });
    for (const t of [`${notes}/todo.md`, `file://${notes}/todo.md`])
      expect(at(t)).toMatchObject({ status: "note", path: "todo.md" });
    expect(at("../app/my design.md")).toMatchObject({ status: "note", path: join(app, "my design.md") });
    expect(at("../app/my%20design.md")).toMatchObject({ status: "note", path: join(app, "my design.md") });
    // resolve takes them too: a file:// URL is a file, not a web page.
    const r = await withHome(() => cli(["resolve", `file://${app}/design.md`], notes));
    expect(r.json.data).toMatchObject({ status: "resolved", abs: join(app, "design.md") });
    expect((await withHome(() => cli(["resolve", `[x](file://${app}/design.md#goals)`], notes))).json.data.abs).toBe(
      join(app, "design.md"),
    );
  });

  test("backlinks: this vault's absolute links, and another vault's path links in every form", async () => {
    await ready;
    const bl = await withHome(async () => (await cli(["backlinks", "todo"], notes)).json.data.backlinks);
    expect(bl.filter((b: { from: string }) => b.from === "index.md")).toHaveLength(2);
    expect(
      bl
        .filter((b: { name: string | null }) => b.name === "papp")
        .map((b: { target: string }) => b.target)
        .sort(),
    ).toEqual(["../notes/todo.md", `file://${notes}/todo.md`, "~/notes/todo.md"].sort());
  });

  test("a rename keeps each path link in its form: absolute, ~/, file://, relative, encoded", async () => {
    await ready;
    await withHome(() => cli(["ls"], app));
    const r = await withHome(() => cli(["mv", "todo", "tasks"], notes));
    expect(r.code).toBe(0);
    const index = readFileSync(join(notes, "index.md"), "utf8");
    expect(index).toContain(`[inside](${notes}/tasks.md) [iu](file://${notes}/tasks.md)`);
    expect(readFileSync(join(app, "links.md"), "utf8")).toBe(
      `[r](../notes/tasks.md) [t](~/notes/tasks.md) [u](file://${notes}/tasks.md)\n`,
    );
    // In the other vault: the spaced note renamed, each link keeps its encoding.
    await withHome(() => cli(["ls"], notes));
    await withHome(() => cli(["mv", "my design", "your design"], app));
    expect(readFileSync(join(notes, "index.md"), "utf8")).toContain(
      "[spaced](<../app/your design.md>) [encoded](../app/your%20design.md)",
    );
  });
});
