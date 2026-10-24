// The TUI's side of upgrading and restarting (UPG): the dialog of choices and checkboxes; the update offer, `:upgrade`;
// `:restart`, its question about notes unsaved, its note, and coming back.
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { takeNote } from "../src/core/restart.ts";
import { dailyUpdateCheck, FROM_SOURCE } from "../src/core/update.ts";
import { saveSession, loadSession } from "../src/core/position.ts";
import { openDialog, type DialogOverlay } from "../src/tui/dialog.ts";
import { cameBack, QUIET_MS, type UpdateEnv } from "../src/tui/updates.ts";
import { PASTE } from "../src/tui/vim.ts";
import { harness, makeSandbox, makeVault } from "./tui-harness.ts";

const sandbox = makeSandbox();

/** The update offer's shape: three choices, a checkbox that goes with the last. */
function offer(h: Awaited<ReturnType<typeof harness>>, unasked = false) {
  const answers: { choice: string; ticked: string[] }[] = [];
  let cancelled = 0;
  const o = openDialog(h.app, {
    title: "slipbox 0.6.0 is out",
    text: "This is 0.5.0.",
    choices: [
      { id: "now", label: "Upgrade and restart", help: "Quits, upgrades and starts 0.6.0 where you were." },
      { id: "later", label: "Upgrade, restart later", help: "Upgrades beside the TUI; :restart starts it." },
      { id: "not", label: "Not now", help: "Asked again at the next check." },
    ],
    checkboxes: [
      {
        id: "skip",
        label: "Skip this version",
        help: "Not asked again until a newer one.",
        ticked: false,
        with: ["not"],
      },
    ],
    escape: "not now",
    unasked,
    done: (choice, ticked) => answers.push({ choice, ticked: [...ticked] }),
    cancel: () => cancelled++,
  });
  return { o, answers, cancelled: () => cancelled };
}

describe("the dialog (UPG-T3)", () => {
  test("drawn framed: its text, its choices with the first marked, its checkbox, the row's help, its keys", async () => {
    const h = await harness();
    offer(h);
    const f = h.frame();
    expect(f).toContain("slipbox 0.6.0 is out");
    expect(f).toContain("This is 0.5.0.");
    expect(f).toContain("● Upgrade and restart");
    expect(f).toContain("○ Upgrade, restart later");
    expect(f).toContain("○ Not now");
    expect(f).toContain("☐ Skip this version");
    expect(f).toContain("Quits, upgrades and starts 0.6.0 where you were.");
    expect(f).toContain("enter: do it · space: tick · esc: not now");
  });

  test("keys: the cursor moves over the choices and the checkbox, marking a choice; space ticks; enter does it", async () => {
    const h = await harness();
    const { o, answers } = offer(h);
    let f = await h.keys("j");
    expect(f).toContain("● Upgrade, restart later");
    expect(f).toContain("Upgrades beside the TUI; :restart starts it.");
    // Onto the checkbox: Not now stays marked; its help shown; space ticks it.
    f = await h.keys("tab", "down", "space");
    expect(o.chosen).toBe(2);
    expect(f).toContain("● Not now");
    expect(f).toContain("☑ Skip this version");
    expect(f).toContain("Not asked again until a newer one.");
    // Wrapping: from the checkbox down to the first choice; the checkbox dimmed there, so not taken.
    await h.keys("ctrl+n");
    expect(o.cursor).toBe(0);
    await h.keys("enter");
    expect(answers).toEqual([{ choice: "now", ticked: [] }]);
    expect(h.app.overlay).toBeNull();
  });

  test("a dimmed checkbox doesn't tick; with its choice, it's taken; up wraps to the last row", async () => {
    const h = await harness();
    const { o, answers } = offer(h);
    await h.keys("k");
    expect(o.cursor).toBe(3);
    expect(o.chosen).toBe(0);
    await h.keys("space");
    expect(o.checkboxes[0]!.ticked).toBe(false);
    await h.keys("k", "j", "space", "enter");
    expect(answers).toEqual([{ choice: "not", ticked: ["skip"] }]);
  });

  test("esc cancels; a paste does nothing", async () => {
    const h = await harness();
    const { cancelled } = offer(h);
    await h.app.input.handleKey(`${PASTE}not a note`);
    expect(h.app.overlay?.kind).toBe("dialog");
    await h.keys("escape");
    expect(h.app.overlay).toBeNull();
    expect(cancelled()).toBe(1);
  });

  test("the mouse: a click on a choice does it, on the checkbox ticks it, outside cancels", async () => {
    const h = await harness();
    const { o, answers, cancelled } = offer(h);
    h.frame();
    const rows = () => h.app.geometry!.choices!.rows;
    const click = (x: number, y: number) => h.app.mouse.handle({ type: "down", x, y, button: 0 });
    const box = rows()[3]!;
    click(box.x + 2, box.y);
    expect(o.checkboxes[0]!.ticked).toBe(false); // dimmed: Upgrade and restart is marked
    const not = rows()[2]!;
    h.app.mouse.handle({ type: "move", x: not.x, y: not.y, button: 0 });
    expect(h.app.overlay).not.toBeNull();
    click(not.x + 2, not.y);
    expect(answers).toEqual([{ choice: "not", ticked: [] }]);
    const again = offer(h);
    h.frame();
    click(0, 0);
    expect(h.app.overlay).toBeNull();
    expect(again.cancelled()).toBe(1);
    expect(cancelled()).toBe(0);
  });

  test("opened on its own, it drops the keys and clicks that arrived in its first half second, by when they arrived", async () => {
    let clock = 1_000_000;
    const h = await harness({ now: () => clock });
    const { o, answers } = offer(h, true);
    // A key typed for the note as it opened: dropped, however late its turn comes.
    clock += 300;
    await h.keys("enter");
    expect(h.app.overlay).toBe(o as DialogOverlay);
    await h.app.overlays.key(o, "enter", o.openedAt - 50);
    expect(h.app.overlay).not.toBeNull();
    h.frame();
    const first = h.app.geometry!.choices!.rows[0]!;
    h.app.mouse.handle({ type: "down", x: first.x + 2, y: first.y, button: 0 });
    expect(answers).toEqual([]);
    // Half a second on: answered.
    clock += 300;
    await h.keys("j", "enter");
    expect(answers).toEqual([{ choice: "later", ticked: [] }]);
    // Asked for: answered at once.
    const asked = offer(h, false);
    await h.keys("enter");
    expect(asked.answers).toEqual([{ choice: "now", ticked: [] }]);
  });

  test("a key that arrived as it opened is dropped though its turn comes later (queued behind one a parse held)", async () => {
    let clock = 1_000_000;
    const h = await harness({ now: () => clock });
    const { o, answers } = offer(h, true);
    let parsed = () => {};
    const parse = new Promise<void>((r) => (parsed = r));
    h.app.views.parses.add(parse);
    clock += 50;
    const first = h.app.input.handleKey("j");
    const second = h.app.input.handleKey("enter");
    clock += 2000;
    h.app.views.parses.delete(parse);
    parsed();
    await Promise.all([first, second]);
    expect(answers).toEqual([]);
    expect(o.cursor).toBe(0);
    expect(h.app.overlay?.kind).toBe("dialog");
  });

  test("ASCII's glyphs: (*) and ( ), [ ] and [x]", async () => {
    const h = await harness({ config: (c) => (c.render.glyphs = "ascii") });
    offer(h);
    const f = await h.keys("j", "j", "j", "space");
    expect(f).toContain("(*) Not now");
    expect(f).toContain("( ) Upgrade and restart");
    expect(f).toContain("[x] Skip this version");
  });
});

type H = Awaited<ReturnType<typeof harness>>;

/** A newest release answered: its SHA256SUMS naming a pack of `version`; every address asked kept. */
function releasesOf(version: string | null) {
  const asked: string[] = [];
  const fetcher = async (url: string) => {
    asked.push(url);
    if (version === null) throw new Error("offline");
    return new Response(`${"a".repeat(64)}  slipbox-${version}-linux-x64.tar.gz\n`);
  };
  return { asked, fetcher };
}

/** A shell script standing in for `slipbox upgrade --json`: it prints `json`, after `sleep` seconds. */
function fakeSlipbox(json: object, sleep = 0): string {
  const file = join(mkdtempSync(join(sandbox, "bin-")), "slipbox");
  writeFileSync(file, `#!/bin/sh\n${sleep ? `sleep ${sleep}\n` : ""}cat <<'EOF'\n${JSON.stringify(json)}\nEOF\n`);
  chmodSync(file, 0o755);
  return file;
}

/** The App given what slipbox knows of itself, as `tui/run.ts` gives it; the check on, a release, version 0.5.0. */
function withEnv(h: H, over: Partial<UpdateEnv> = {}, check = { on: true }): UpdateEnv {
  const env: UpdateEnv = {
    release: { repo: "o/r", target: "linux-x64" },
    version: "0.5.0",
    by: "installer",
    channel: "stable",
    data: mkdtempSync(join(sandbox, "data-")),
    execPath: fakeSlipbox({ ok: true, data: { status: "current", from: "0.5.0", latest: "0.5.0", removed: [] } }),
    stateDir: mkdtempSync(join(sandbox, "state-")),
    env: {},
    checkOn: () => check.on,
    ...over,
  };
  h.app.updates.env = env;
  return env;
}

/** A harness on a clock of its own, the input last used `ago` ms before now. */
async function clocked(ago = 0) {
  const clock = { now: 2_000_000_000_000 };
  const h = await harness({ now: () => clock.now });
  h.app.lastInputAt = clock.now - ago;
  return { h, clock };
}

const found = { version: "0.6.0", said: "slipbox 0.6.0 is out (this is 0.5.0): slipbox upgrade installs it" };

describe("the update offer (UPG-T4)", () => {
  test("found, it's kept in the messages list and offered once the TUI is quiet — not while typing, a sequence pending, a selection", async () => {
    const { h, clock } = await clocked();
    withEnv(h);
    h.app.updates.found(found);
    expect(h.app.messages.at(-1)?.text).toBe(found.said);
    expect(h.app.toasts.some((t) => t.text === found.said)).toBe(false);
    expect(h.app.overlay).toBeNull();
    // Typing: inserting, a selection, a sequence pending — each holds it back, however long since the last key.
    for (const [into, out] of [
      ["i", "escape"],
      ["v", "escape"],
      ["space", "escape"],
    ]) {
      await h.keys(into!);
      clock.now += QUIET_MS + 1;
      h.app.updates.tick();
      expect(h.app.overlay?.kind).not.toBe("dialog");
      await h.keys(out!);
    }
    clock.now += QUIET_MS - 1;
    h.app.updates.tick();
    expect(h.app.overlay).toBeNull();
    clock.now += 1;
    h.app.updates.tick();
    expect(h.app.overlay?.kind).toBe("dialog");
    const f = h.frame();
    expect(f).toContain("slipbox 0.6.0 is out");
    expect(f).toContain("This is 0.5.0.");
    expect(f).toContain("● Upgrade and restart");
    expect(f).toContain("○ Upgrade, restart later");
    expect(f).toContain("☐ Skip this version");
  });

  test("dropped when the check was turned off meanwhile — your config, DO_NOT_TRACK", async () => {
    for (const off of ["config", "dnt"]) {
      const { h, clock } = await clocked(QUIET_MS);
      const check = { on: true };
      withEnv(h, off === "dnt" ? { env: { DO_NOT_TRACK: "1" } } : {}, check);
      h.app.lastInputAt = clock.now;
      h.app.updates.found(found);
      if (off === "config") check.on = false;
      clock.now += QUIET_MS;
      h.app.updates.tick();
      expect(h.app.overlay).toBeNull();
      check.on = true;
      h.app.updates.tick();
      expect(h.app.overlay).toBeNull();
    }
  });

  test("by how it was installed: Homebrew's copies brew's command, one put by hand the releases' address", async () => {
    for (const [by, choice, copied] of [
      ["homebrew", "Copy brew upgrade slipbox", "brew upgrade slipbox"],
      ["other", "Copy the releases' address", "https://github.com/o/r/releases"],
    ] as const) {
      const { h, clock } = await clocked(QUIET_MS);
      withEnv(h, { by });
      h.app.updates.found(found);
      const f = h.frame();
      expect(f).toContain(`● ${choice}`);
      expect(f).toContain("○ Not now");
      expect(f).not.toContain("Upgrade and restart");
      clock.now += DROP;
      await h.keys("enter");
      expect(h.copied).toContain(copied);
    }
  });

  test("Skip this version, with Not now: kept, and the daily check offers it no more — a newer one it does", async () => {
    const { h, clock } = await clocked(QUIET_MS);
    const env = withEnv(h);
    h.app.updates.found(found);
    clock.now += DROP;
    await h.keys("k", "k", "j", "space", "enter");
    const stateFile = join(env.stateDir, "update.json");
    expect(JSON.parse(readFileSync(stateFile, "utf8")).skipped).toBe("0.6.0");
    const check = (latest: string) =>
      dailyUpdateCheck({
        release: env.release,
        version: "0.5.0",
        enabled: true,
        env: {},
        stateFile,
        now: Date.now() + 2 * 24 * 60 * 60 * 1000 + Math.random(),
        fetcher: releasesOf(latest).fetcher,
      });
    expect(await check("0.6.0")).toBeNull();
    writeFileSync(stateFile, JSON.stringify({ ...JSON.parse(readFileSync(stateFile, "utf8")), checked: 0 }));
    expect((await check("0.7.0"))?.version).toBe("0.7.0");
  });

  test("Upgrade, restart later: slipbox upgrade --json beside the TUI, its answer read from its file — installed, or why not", async () => {
    const { h, clock } = await clocked(QUIET_MS);
    const said = { ok: true, data: { status: "upgraded", from: "0.5.0", latest: "0.6.0", removed: [] } };
    const env = withEnv(h, { execPath: fakeSlipbox(said) });
    h.app.updates.found(found);
    clock.now += DROP;
    await h.keys("j", "enter");
    expect(h.app.messages.at(-1)?.text).toBe("upgrading to 0.6.0…");
    await h.app.updates.background!.done;
    expect(h.app.messages.at(-1)?.text).toBe("slipbox 0.6.0 is installed (this is 0.5.0): :restart starts it");
    expect(existsSync(join(env.stateDir, `upgrade-${process.pid}.json`))).toBe(false);
    expect(h.app.updates.mine.has("0.6.0")).toBe(true);
    // Failed: said, as an error.
    withEnv(h, { execPath: fakeSlipbox({ ok: false, error: { code: 1, message: "couldn't download it" } }) });
    h.app.updates.upgradeBeside("0.6.0");
    await h.app.updates.background!.done;
    expect(h.app.messages.at(-1)).toMatchObject({
      level: "error",
      text: "the upgrade to 0.6.0 failed: couldn't download it",
    });
  });

  test(":upgrade asks now, whatever the check says, and offers what it finds — a skipped one too; nothing newer, said; from source, nothing asked", async () => {
    const { h } = await clocked();
    const latest = releasesOf("0.6.0");
    const env = withEnv(h, { env: { DO_NOT_TRACK: "1" }, fetcher: latest.fetcher }, { on: false });
    writeFileSync(join(env.stateDir, "update.json"), JSON.stringify({ skipped: "0.6.0" }));
    await h.keys(":", ..."upgrade".split(""), "enter");
    await Bun.sleep(20);
    expect(latest.asked).toEqual(["https://github.com/o/r/releases/latest/download/SHA256SUMS"]);
    expect(h.app.overlay?.kind).toBe("dialog");
    expect(h.frame()).toContain("slipbox 0.6.0 is out");
    // Asked for: answered at once, keys not dropped.
    await h.keys("escape");
    expect(h.app.overlay).toBeNull();
    expect(JSON.parse(readFileSync(join(env.stateDir, "update.json"), "utf8"))).toMatchObject({ latest: "0.6.0" });
    // Nothing newer.
    withEnv(h, { fetcher: releasesOf("0.5.0").fetcher });
    await h.app.updates.check();
    expect(h.app.messages.at(-1)?.text).toBe("slipbox 0.5.0 is the newest");
    withEnv(h, { channel: "preview", fetcher: releasesOf("0.5.0").fetcher });
    await h.app.updates.check();
    expect(h.app.messages.at(-1)?.text).toBe("slipbox 0.5.0 is the newest release or preview");
    // Offline: said.
    withEnv(h, { fetcher: releasesOf(null).fetcher });
    await h.app.updates.check();
    expect(h.app.messages.at(-1)).toMatchObject({ level: "error" });
    // From source: nothing asked.
    const none = releasesOf("0.6.0");
    withEnv(h, { release: null, fetcher: none.fetcher });
    await h.app.updates.check();
    expect(h.app.messages.at(-1)?.text).toBe(FROM_SOURCE);
    expect(none.asked).toEqual([]);
  });

  test(":upgrade, the newest installed already underneath: the restart offered instead", async () => {
    const { h } = await clocked();
    const data = mkdtempSync(join(sandbox, "data-"));
    mkdirSync(join(data, "versions", "0.6.0"), { recursive: true });
    symlinkSync("versions/0.6.0", join(data, "current"));
    withEnv(h, { data, fetcher: releasesOf("0.6.0").fetcher });
    await h.app.updates.check();
    const f = h.frame();
    expect(f).toContain("slipbox 0.6.0 is installed");
    expect(f).toContain("● Restart now");
    await h.keys("j", "enter");
    expect(h.app.messages.at(-1)?.text).toBe("slipbox 0.6.0 is installed: :restart starts it");
  });
});

/** What an unasked dialog drops is past. */
const DROP = 520;

describe("restarting (UPG-T5)", () => {
  test("nothing unsaved: its note — where it is, this window's session — written, and slipbox quit as quitting does", async () => {
    const h = await harness();
    withEnv(h);
    await h.app.run("window.split_side");
    await h.app.run("note.open notes/alpha.md");
    await h.keys(":", ..."restart".split(""), "enter");
    await Bun.sleep(10);
    expect(h.quit.called).toBe(true);
    const note = takeNote({ pid: process.pid, ppid: -1 })!;
    expect(note).toMatchObject({ pid: process.pid, from: "0.5.0", upgrade: null, outcome: null });
    expect(note.place).toEqual({ mode: "vault", root: h.root, homeFolder: null });
    const tabs = (note.session as { tabs: { panes: { path: string }[] }[] }).tabs;
    expect(tabs.map((t) => t.panes.map((p) => p.path))).toEqual([["index.md", "notes/alpha.md"]]);
    expect(h.app.updates.restartNote).toEqual(note);
  });

  test("notes unsaved: asked first, naming them — Cancel restarts nothing; Save and restart saves them, then restarts", async () => {
    const h = await harness();
    withEnv(h);
    await h.keys("i", "X", "escape");
    await h.app.updates.restart();
    let f = h.frame();
    expect(f).toContain("Restart");
    expect(f).toContain("1 note is unsaved: index.md.");
    expect(f).toContain("● Save and restart");
    await h.keys("escape");
    expect(h.quit.called).toBe(false);
    expect(h.app.dirtyBuffers()).toHaveLength(1);
    await h.app.updates.restart();
    f = await h.keys("enter");
    expect(h.app.dirtyBuffers()).toHaveLength(0);
    expect(readFileSync(join(h.root, "index.md"), "utf8")).toStartWith("X");
    expect(h.quit.called).toBe(true);
    takeNote({ pid: process.pid, ppid: -1 });
  });

  test("a note that can't be saved stops it there, as :wqa stops, saying which: nothing quits", async () => {
    const h = await harness();
    withEnv(h);
    await h.keys("i", "X", "escape");
    await h.app.run("window.split_side");
    await h.app.run("note.open notes/alpha.md");
    await h.keys("i", "Y", "escape");
    writeFileSync(join(h.root, "index.md"), "changed on disk meanwhile, by another hand\n");
    await h.app.updates.restart();
    expect(h.frame()).toContain("2 notes are unsaved: index.md, notes/alpha.md.");
    await h.keys("enter");
    expect(h.quit.called).toBe(false);
    expect(h.app.messages.some((m) => m.text === "the restart stopped: index.md isn't saved")).toBe(true);
    expect(readFileSync(join(h.root, "notes", "alpha.md"), "utf8")).not.toStartWith("Y");
    expect(takeNote({ pid: process.pid, ppid: -1 })).toBeNull();
  });

  test("Upgrade and restart: the note asks for the version offered", async () => {
    const { h, clock } = await clocked(QUIET_MS);
    withEnv(h);
    h.app.updates.found(found);
    clock.now += DROP;
    await h.keys("enter");
    await Bun.sleep(10);
    expect(h.quit.called).toBe(true);
    expect(takeNote({ pid: process.pid, ppid: -1 })?.upgrade).toBe("0.6.0");
  });

  test("an upgrade beside the TUI is waited for, saying so", async () => {
    const h = await harness();
    withEnv(h, {
      execPath: fakeSlipbox({ ok: true, data: { status: "upgraded", from: "0.5.0", latest: "0.6.0", removed: [] } }, 1),
    });
    h.app.updates.upgradeBeside("0.6.0");
    const restarting = h.app.updates.restart();
    expect(h.app.messages.at(-1)?.text).toBe("waiting for the upgrade to 0.6.0 to finish…");
    expect(h.quit.called).toBe(false);
    await restarting;
    expect(h.quit.called).toBe(true);
    takeNote({ pid: process.pid, ppid: -1 });
  });

  test("coming back: the note's place over the arguments' path, --base not applied again; its session, not session.json's", async () => {
    const first = await harness();
    withEnv(first);
    await first.app.run("window.split_side");
    await first.app.run("note.open notes/alpha.md");
    await first.app.updates.restart();
    const note = takeNote({ pid: process.pid, ppid: -1 })!;
    // Another window on the vault saves its own session meanwhile.
    const other = loadSession(first.app.loc)!;
    saveSession(first.app.loc, {
      ...other,
      tabs: [{ panes: [{ path: "notes/beta.md", anchor: other.tabs[0]!.panes[0]!.anchor }], active: 0 }],
      activeTab: 0,
      branches: {},
    });
    const back = cameBack(note, "0.6.0");
    const { prepare } = await import("../src/tui/run.ts");
    // Started with another vault's path, and a --base that names nothing: the note's vault, and no refusal.
    const start = prepare([makeVault(), "--base", "no-such-ref-anywhere"], back);
    if (typeof start === "number") throw new Error(`exit ${start}`);
    expect(start.loc.root).toBe(first.root);
    expect(start.open).toBeNull();
    expect([...(start.warnings ?? []), ...(start.notes ?? [])].filter((w) => w.includes("--base"))).toEqual([]);
    expect(start.restarted?.said).toEqual({ level: "info", text: "restarted: slipbox 0.6.0 (was 0.5.0)" });
    const h = await harness({ root: first.root, open: null, restarted: start.restarted });
    expect(h.app.tabs.map((t) => t.views.map((v) => v.buf.key))).toEqual([["index.md", "notes/alpha.md"]]);
    expect(h.app.messages.some((m) => m.text === "restarted: slipbox 0.6.0 (was 0.5.0)")).toBe(true);
  });

  test("coming back after a failed upgrade: said as an error; a place gone: the arguments, and no session of another vault", async () => {
    const note = {
      pid: 1,
      at: Date.now(),
      from: "0.5.0",
      upgrade: "0.6.0",
      outcome: { ok: false as const, why: "couldn't download it" },
      place: { mode: "vault", root: join(sandbox, "gone"), homeFolder: null },
      session: { version: 1, tabs: [], activeTab: 0, sidebar: true },
    };
    const back = cameBack(note, "0.5.0");
    expect(back.said).toEqual({
      level: "error",
      text: "the upgrade to 0.6.0 failed: couldn't download it — this is 0.5.0",
    });
    const { prepare } = await import("../src/tui/run.ts");
    const root = makeVault();
    const start = prepare([root], back);
    if (typeof start === "number") throw new Error(`exit ${start}`);
    expect(start.loc.root).toBe(root);
    expect(start.restarted?.session).toBeNull();
  });
});
