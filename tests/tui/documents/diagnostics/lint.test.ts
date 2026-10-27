import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, statusRow } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("the lint surface: your linter's findings in notes (3.21)", () => {
  /** A stand-in for markdownlint-cli2: one finding on line 3 of each file it's given. */
  const FAKE = [
    "sh",
    "-c",
    'for f; do printf "%s:3:5 error MD013/line-length Line length [Expected: 80]\\n" "$f"; done; exit 1',
    "lint",
  ];
  const setup = async (command = FAKE) => {
    const root = makeVault();
    writeFileSync(join(root, "l.md"), "# L\n\nA long line here,\nits paragraph going on.\n");
    const h = await harness({
      root,
      open: "l.md",
      config: (c) => (
        (c.lint.enabled = "on"), (c.lint.command = command), (c.lint.follow_view = false), (c.ui.line_numbers = true)
      ),
    });
    return { root, h };
  };
  const until = async (ok: () => boolean) => {
    for (const t = Date.now(); !ok() && Date.now() - t < 25_000; ) await new Promise((r) => setTimeout(r, 20));
    expect(ok()).toBe(true);
  };

  test("once a note is saved it's linted: counted on the status line, its line number marked; editing hides them until saved", async () => {
    const { h } = await setup();
    h.frame();
    await until(() => h.app.view!.buf.lint !== null);
    expect(statusRow(h.frame())).toContain("⚠ 1"); // how many of each severity (19.8)
    await h.keys("j", "j"); // line 3: the status line still counts, never says what (the Problems panel does)
    expect(statusRow(h.frame())).toContain("⚠ 1");
    expect(statusRow(h.frame())).not.toContain("MD013");
    const c = h.canvas();
    const rows = c.toString().split("\n");
    const at = (n: string, text: string) => {
      const y = rows.findIndex((r) => new RegExp(`┃.{0,4}${n}\\s.*${text}`).test(r));
      return c.styles[y]![[...rows[y]!].indexOf(n, [...rows[y]!].indexOf("┃"))]!.fg;
    };
    expect(at("3", "A long")).toBe(h.app.theme.roles.warn.fg!);
    expect(at("1", "L")).not.toBe(h.app.theme.roles.warn.fg!);
    // Beside line numbers, no problems bar (19.9): the number in the worst one's colour, bold — clicked, as a sign is.
    const y3 = rows.findIndex((r) => /A long/.test(r));
    const num = [...rows[y3]!].indexOf("┃") + 2; // the border, a margin, then the number
    expect([...rows[y3]!].slice(num, num + 4).join("")).toBe("3  A"); // the number, the gutter's space, the page's
    expect(c.styles[y3]![num]!).toMatchObject({ fg: h.app.theme.roles.warn.fg!, bold: true });
    const signs = h.app.geometry!.hot.filter((x) => x.id.startsWith("pbar:3:"));
    expect(signs).toHaveLength(1); // the number's, no sign under it
    expect([signs[0]!.y, signs[0]!.x <= num && num < signs[0]!.x + signs[0]!.w]).toEqual([y3, true]);
    for (const type of ["down", "up"]) h.app.mouse.handle({ type, x: num, y: y3, button: 0 });
    expect(h.app.problems.panel).toMatchObject({ shown: true, tab: "file" });
    h.app.problems.close();
    // Typing: its text isn't the file's any more — nothing shown until it's saved (and linted again).
    h.app.view!.buf.edit(0, 0, "x");
    h.frame();
    await new Promise((r) => setTimeout(r, 450)); // past a re-lint's 300 ms: none while it's unsaved
    h.frame();
    expect(h.app.problems.ofView(h.app.view!)).toEqual([]);
    expect(statusRow(h.frame())).not.toMatch(/⚠ [1-9]|MD013/);
    expect(statusRow(h.frame())).toContain("⚠ 0"); // none: the Problems panel's button
    h.app.saving.save(h.app.view!.buf);
    h.frame();
    await until(() => h.app.problems.ofView(h.app.view!).length > 0);
  });

  test("the Problems panel lints the root: a Lint section by note; enter opens a finding; a linter that can't run says so once", async () => {
    const { h } = await setup();
    await h.keys("space", "v", "p");
    await until(() => h.app.languages.vaultLint.issues !== null && !h.app.languages.vaultLint.running);
    const rows = h.app.problems.rows();
    const lint = rows.filter((r) => r.section === "Lint");
    expect(lint[0]!.label).toMatch(/^Lint \(\d+\)$/);
    const row = lint.findIndex((r) => r.lint?.file.endsWith("/l.md"));
    expect(lint[row - 1]!.note).toBe("l.md");
    h.app.problems.panel.all.selected = rows.indexOf(lint[row]!);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("l.md");
    expect(statusRow(h.frame())).toContain("L3:1"); // rendered: its line's start, not the row's end (a regression)
    // Filtered, the note's row first: enter takes it to its finding, not its top (a regression).
    await h.keys("g", "g");
    await h.keys("space", "v", "p");
    await until(() => !h.app.languages.vaultLint.running);
    await h.keys("/");
    await h.keys(...[..."MD013 l.md"].map((c) => (c === " " ? "space" : c)));
    expect(h.app.problems.rows()[h.app.problems.panel.all.selected]!.note).toBe("l.md");
    await h.keys("enter");
    expect(h.app.cursorLine(h.app.view!)).toBe(3);
    // In source mode, on its column.
    await h.app.run("view.source");
    await h.keys("g", "g", "space", "v", "p");
    h.app.problems.panel.all.selected = h.app.problems.rows().findIndex((r) => r.lint?.file.endsWith("/l.md"));
    await h.keys("enter");
    expect(statusRow(h.frame())).toContain("L3:5");
    // Not there: said once, lint off.
    const bad = await setup(["no-such-linter-slipbox-test"]);
    bad.h.frame();
    await until(() => bad.h.app.languages.lintCmd === null);
    expect(bad.h.app.messages.filter((m) => m.text.includes("couldn't run"))).toHaveLength(1);
  });

  test("a run printing past slipbox's limit: its findings aren't shown, said once why, and lint stays on", async () => {
    // Its first three runs print 17 MB (past 16 MiB); every run after, a finding a file.
    const count = join(mkdtempSync(join(sandbox, "lint-thrice-")), "runs");
    const thrice = `n=$(cat '${count}' 2>/dev/null || echo 0); echo $((n + 1)) > '${count}'; if [ "$n" -ge 3 ]; then ${FAKE[2]}; fi; yes x | head -c 17000000; exit 1`;
    const { h } = await setup(["sh", "-c", thrice, "lint"]);
    h.frame();
    const buf = h.app.view!.buf;
    const said = () => h.app.messages.filter((m) => m.text.includes("16 MiB")).map((m) => m.text);
    await until(() => buf.lint !== null || h.app.languages.lintCmd === null);
    expect(h.app.languages.lintCmd).not.toBeNull();
    expect(buf.lint).toMatchObject({ issues: [], skipped: expect.stringContaining("16 MiB") });
    expect(h.app.problems.ofView(h.app.view!)).toEqual([]);
    expect(said()).toEqual([
      "lint: l.md: stdout output limit (16 MiB) exceeded; partial output discarded — this run's findings aren't shown",
    ]);
    expect(h.app.messages.filter((m) => m.text.includes("couldn't run"))).toHaveLength(0);
    // The vault's run: its Lint heading says why, none listed.
    await h.keys("space", "v", "p");
    await until(() => !h.app.languages.vaultLint.running);
    expect(
      h.app.problems
        .rows()
        .filter((r) => r.section === "Lint")
        .map((r) => r.label),
    ).toEqual(["Lint — not shown: stdout output limit (16 MiB) exceeded; partial output discarded"]);
    expect(said()).toHaveLength(2); // the vault's, once
    h.app.problems.close();
    // Saved again: linted again — past the limit again, not said again; then its findings shown.
    const saveAgain = () => {
      buf.edit(0, 0, "x");
      h.app.saving.save(buf);
      h.frame();
    };
    saveAgain();
    await until(() => buf.lint?.version === buf.version);
    expect(buf.lint?.skipped).toContain("16 MiB");
    expect(said()).toHaveLength(2);
    saveAgain();
    await until(() => h.app.problems.ofView(h.app.view!).length > 0);
  });

  test("quitting stops a lint run under way: nothing of it outlives the screen", async () => {
    const pidFile = join(mkdtempSync(join(sandbox, "lint-quit-")), "pid");
    const { h } = await setup(["sh", "-c", `echo $$ > '${pidFile}'; exec sleep 30`, "lint"]);
    h.frame();
    await until(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim() !== "");
    const tool = Number(readFileSync(pidFile, "utf8").trim());
    const alive = () => {
      try {
        process.kill(-tool, 0);
        return true;
      } catch {
        return false;
      }
    };
    try {
      expect(alive()).toBe(true);
      h.app.quit();
      await until(() => !alive());
      expect(h.app.messages.filter((m) => /couldn't run|aren't shown/.test(m.text))).toHaveLength(0);
    } finally {
      if (alive()) process.kill(-tool, "SIGKILL");
    }
  });
});
