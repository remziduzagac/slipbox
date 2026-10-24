// The TUI's side of upgrading and restarting (UPG): the dialog of choices and checkboxes; the update offer, `:upgrade`;
// `:restart`, its question about notes unsaved, its note, and coming back.
import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { COMMAND_SPECS } from "../src/core/command-specs.ts";
import { takeNote } from "../src/core/restart.ts";
import { dailyUpdateCheck, FROM_SOURCE } from "../src/core/update.ts";
import { saveSession, loadSession } from "../src/core/position.ts";
import { openDialog, type DialogOverlay } from "../src/tui/dialog.ts";
import { cameBack, QUIET_MS, type UpdateEnv } from "../src/tui/updates.ts";
import { PASTE } from "../src/tui/vim.ts";
import { harness, makeSandbox, makeVault } from "./tui-harness.ts";

const sandbox = makeSandbox();

type H = Awaited<ReturnType<typeof harness>>;

/** A harness on a clock of its own, the input last used `ago` ms before now. */
async function clocked(ago = 0, opts: Parameters<typeof harness>[0] = {}) {
  const clock = { now: 2_000_000_000_000 };
  const h = await harness({ ...opts, now: () => clock.now });
  h.app.lastInputAt = clock.now - ago;
  return { h, clock };
}

/** What a dialog drops is past: it drew, and half a second went by — on the test's clock, else the real one. */
const DROP = 520;
async function shown(h: H, clock?: { now: number }): Promise<void> {
  h.frame();
  if (clock) clock.now += DROP;
  else await Bun.sleep(DROP);
}

/** The update offer's shape: three choices, a checkbox that goes with the last. */
function offer(h: H) {
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
    const { h, clock } = await clocked();
    const { o, answers } = offer(h);
    await shown(h, clock);
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

  test("a dimmed checkbox ticked marks the choice it goes with: Skip this version, Not now; up wraps to the last row", async () => {
    const { h, clock } = await clocked();
    const { o, answers } = offer(h);
    await shown(h, clock);
    await h.keys("k");
    expect(o.cursor).toBe(3);
    expect(o.chosen).toBe(0);
    const f = await h.keys("space");
    expect(o.checkboxes[0]!.ticked).toBe(true);
    expect(f).toContain("● Not now");
    await h.keys("enter");
    expect(answers).toEqual([{ choice: "not", ticked: ["skip"] }]);
  });

  test("esc cancels; a paste does nothing", async () => {
    const { h, clock } = await clocked();
    const { cancelled } = offer(h);
    await shown(h, clock);
    await h.app.input.handleKey(`${PASTE}not a note`);
    expect(h.app.overlay?.kind).toBe("dialog");
    await h.keys("escape");
    expect(h.app.overlay).toBeNull();
    expect(cancelled()).toBe(1);
  });

  test("the mouse: a click on a choice does it; on Skip this version ticks it and marks Not now; outside cancels", async () => {
    const { h, clock } = await clocked();
    const { o, answers, cancelled } = offer(h);
    await shown(h, clock);
    const rows = () => h.app.geometry!.choices!.rows;
    const click = (x: number, y: number) => h.app.mouse.handle({ type: "down", x, y, button: 0 });
    const box = rows()[3]!;
    click(box.x + 2, box.y);
    expect(o.checkboxes[0]!.ticked).toBe(true);
    expect(o.chosen).toBe(2);
    expect(h.app.overlay).not.toBeNull();
    const not = rows()[2]!;
    click(not.x + 2, not.y);
    expect(answers).toEqual([{ choice: "not", ticked: ["skip"] }]);
    const later = offer(h);
    await shown(h, clock);
    click(rows()[1]!.x + 2, rows()[1]!.y);
    expect(later.answers).toEqual([{ choice: "later", ticked: [] }]);
    const again = offer(h);
    await shown(h, clock);
    click(0, 0);
    expect(h.app.overlay).toBeNull();
    expect(again.cancelled()).toBe(1);
    expect(cancelled()).toBe(0);
  });

  test("every dialog drops the keys and clicks that came before it was drawn, or in the half second after, by arrival", async () => {
    const { h, clock } = await clocked();
    const { o, answers } = offer(h);
    // Not drawn yet: however late, a key doesn't answer it.
    clock.now += 5000;
    await h.app.input.handleKey("enter");
    expect(h.app.overlay).toBe(o as DialogOverlay);
    // Drawn: what came before, and in the half second after, dropped.
    h.frame();
    expect(o.drawnAt).toBe(clock.now);
    await h.app.overlays.key(o, "enter", clock.now - 50);
    clock.now += 300;
    await h.keys("enter");
    const first = h.app.geometry!.choices!.rows[0]!;
    h.app.mouse.handle({ type: "down", x: first.x + 2, y: first.y, button: 0 });
    expect(answers).toEqual([]);
    // Half a second on: answered.
    clock.now += 300;
    await h.keys("j", "enter");
    expect(answers).toEqual([{ choice: "later", ticked: [] }]);
  });

  test("a key that arrived as it showed is dropped though its turn comes later (queued behind one a parse held)", async () => {
    const { h, clock } = await clocked();
    const { o, answers } = offer(h);
    h.frame();
    let parsed = () => {};
    const parse = new Promise<void>((r) => (parsed = r));
    h.app.views.parses.add(parse);
    clock.now += 50;
    const first = h.app.input.handleKey("j");
    const second = h.app.input.handleKey("enter");
    clock.now += 2000;
    h.app.views.parses.delete(parse);
    parsed();
    await Promise.all([first, second]);
    expect(answers).toEqual([]);
    expect(o.cursor).toBe(0);
    expect(h.app.overlay?.kind).toBe("dialog");
  });

  test("a terminal narrower than it would be: drawn whole, its rows cut short, its marks there", async () => {
    const h = await harness({ width: 18, height: 30 });
    offer(h);
    const rows = h.frame().split("\n");
    // Its left border on screen, and each row's mark after it.
    expect(rows.some((r) => /^.[│┃] ● Upgrade/.test(r))).toBe(true);
    expect(rows.some((r) => /^.[│┃] ○ Not now/.test(r))).toBe(true);
    expect(rows.some((r) => /^.[│┃] ☐ Skip/.test(r))).toBe(true);
  });

  test("ASCII's glyphs: (*) and ( ), [ ] and [x]", async () => {
    const { h, clock } = await clocked(0, { config: (c) => (c.render.glyphs = "ascii") });
    offer(h);
    await shown(h, clock);
    const f = await h.keys("j", "j", "j", "space");
    expect(f).toContain("(*) Not now");
    expect(f).toContain("( ) Upgrade and restart");
    expect(f).toContain("[x] Skip this version");
  });
});

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
    startedBy: null,
    stateDir: mkdtempSync(join(sandbox, "state-")),
    env: {},
    checkOn: () => check.on,
    // Never the network: a test's daily check is refused, unless the test answers it.
    fetcher: async (url) => Promise.reject(new Error(`no network in a test (${url})`)),
    ...over,
  };
  h.app.updates.env = env;
  return env;
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
    // Typing: inserting, a selection, a sequence pending, an operator or a count waiting — each holds it back, however
    // long since the last key.
    for (const [into, out] of [
      ["i", "escape"],
      ["v", "escape"],
      ["space", "escape"],
      ["d", "escape"],
      ["3", "escape"],
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
      await shown(h, clock);
      await h.keys("enter");
      expect(h.copied).toContain(copied);
    }
  });

  test("Skip this version, with Not now: kept, and the daily check offers it no more — a newer one it does", async () => {
    const { h, clock } = await clocked(QUIET_MS);
    const env = withEnv(h);
    h.app.updates.found(found);
    await shown(h, clock);
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
    await shown(h, clock);
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
    const { h, clock } = await clocked();
    const latest = releasesOf("0.6.0");
    const env = withEnv(h, { env: { DO_NOT_TRACK: "1" }, fetcher: latest.fetcher }, { on: false });
    writeFileSync(join(env.stateDir, "update.json"), JSON.stringify({ skipped: "0.6.0" }));
    await h.keys(":", ..."upgrade".split(""), "enter");
    await Bun.sleep(20);
    expect(latest.asked).toEqual(["https://github.com/o/r/releases/latest/download/SHA256SUMS"]);
    expect(h.app.overlay?.kind).toBe("dialog");
    expect(h.frame()).toContain("slipbox 0.6.0 is out");
    // Nothing typed while it asked: opened at once.
    await shown(h, clock);
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

  test(":upgrade, the newest installed already underneath: the restart offered instead, and counted as offered", async () => {
    const { h, clock } = await clocked();
    const data = mkdtempSync(join(sandbox, "data-"));
    mkdirSync(join(data, "versions", "0.6.0"), { recursive: true });
    symlinkSync("versions/0.6.0", join(data, "current"));
    withEnv(h, { data, fetcher: releasesOf("0.6.0").fetcher });
    await h.app.updates.check();
    const f = h.frame();
    expect(f).toContain("slipbox 0.6.0 is installed");
    expect(f).toContain("● Restart now");
    await shown(h, clock);
    await h.keys("j", "enter");
    expect(h.app.messages.at(-1)?.text).toBe("slipbox 0.6.0 is installed: :restart starts it");
    // Not offered again by itself, ten seconds on.
    await h.app.updates.lookUnderneath();
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.app.overlay).toBeNull();
  });

  test(":upgrade typed into while it asks: its offer waits for quiet, and what was typed never answers it", async () => {
    const { h, clock } = await clocked();
    let answer = (_: Response) => {};
    const fetcher = () => new Promise<Response>((r) => (answer = r));
    withEnv(h, { fetcher });
    await h.keys(":", ..."upgrade".split(""), "enter");
    clock.now += 200;
    await h.keys("i", "x");
    answer(new Response(`${"a".repeat(64)}  slipbox-0.6.0-linux-x64.tar.gz\n`));
    await Bun.sleep(20);
    expect(h.app.overlay).toBeNull();
    await h.keys("enter", "escape");
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.frame()).toContain("slipbox 0.6.0 is out");
  });

  test("two waiting: the daily check's offer and a restart underneath, each shown in turn, neither lost", async () => {
    const { h, clock } = await clocked();
    const data = mkdtempSync(join(sandbox, "data-"));
    for (const v of ["0.5.0", "0.5.5"]) mkdirSync(join(data, "versions", v), { recursive: true });
    symlinkSync("versions/0.5.5", join(data, "current"));
    withEnv(h, { data });
    h.app.updates.found(found);
    await h.app.updates.lookUnderneath();
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.frame()).toContain("slipbox 0.6.0 is out");
    await shown(h, clock);
    await h.keys("escape");
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.frame()).toContain("slipbox 0.5.5 is installed");
  });

  test("an offer and a restart underneath of the same version: the restart alone, whichever came first", async () => {
    const { h, clock } = await clocked();
    const data = mkdtempSync(join(sandbox, "data-"));
    for (const v of ["0.5.0", "0.6.0"]) mkdirSync(join(data, "versions", v), { recursive: true });
    symlinkSync("versions/0.5.0", join(data, "current"));
    withEnv(h, { data });
    // The daily check's offer first, then 0.6.0 installed by another terminal.
    h.app.updates.found(found);
    relink("versions/0.6.0", join(data, "current"));
    await h.app.updates.lookUnderneath();
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.frame()).toContain("slipbox 0.6.0 is installed");
    await shown(h, clock);
    await h.keys("escape");
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.app.overlay).toBeNull();
    // The restart waiting first, then the daily check's offer.
    const second = await clocked();
    withEnv(second.h, { data: mkdtempSync(join(sandbox, "data-")) });
    const d2 = second.h.app.updates.env!.data;
    for (const v of ["0.5.0", "0.6.0"]) mkdirSync(join(d2, "versions", v), { recursive: true });
    symlinkSync("versions/0.6.0", join(d2, "current"));
    await second.h.app.updates.lookUnderneath();
    second.h.app.updates.found(found);
    second.clock.now += QUIET_MS;
    second.h.app.updates.tick();
    expect(second.h.frame()).toContain("slipbox 0.6.0 is installed");
    await shown(second.h, second.clock);
    await second.h.keys("escape");
    second.clock.now += QUIET_MS;
    second.h.app.updates.tick();
    expect(second.h.app.overlay).toBeNull();
  });

  test("a background upgrade's answer left a day ago is cleared at start; a fresh one, and the check's file, stay", async () => {
    const h = await harness();
    const env = withEnv(h, {}, { on: false });
    for (const f of ["upgrade-1.json", "upgrade-2.json", "update.json"]) writeFileSync(join(env.stateDir, f), "{}");
    const old = (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000;
    for (const f of ["upgrade-1.json", "update.json"]) utimesSync(join(env.stateDir, f), old, old);
    h.app.updates.start();
    expect(readdirSync(env.stateDir).sort()).toEqual(["update.json", "upgrade-2.json"]);
  });

  test("Upgrade, restart later with this binary gone (another window's upgrade removed it): current's runs it", async () => {
    const { h } = await clocked();
    const data = mkdtempSync(join(sandbox, "data-"));
    const said = { ok: true, data: { status: "upgraded", from: "0.5.0", latest: "0.6.0", removed: [] } };
    mkdirSync(join(data, "versions", "0.5.5"), { recursive: true });
    renameSync(fakeSlipbox(said), join(data, "versions", "0.5.5", "slipbox"));
    symlinkSync("versions/0.5.5", join(data, "current"));
    withEnv(h, { data, execPath: join(sandbox, "removed", "slipbox") });
    h.app.updates.upgradeBeside("0.6.0");
    await h.app.updates.background!.done;
    expect(h.app.messages.at(-1)?.text).toBe("slipbox 0.6.0 is installed (this is 0.5.0): :restart starts it");
  });
});

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
    const { h, clock } = await clocked();
    withEnv(h);
    await h.keys("i", "X", "escape");
    await h.app.updates.restart();
    const f = h.frame();
    expect(f).toContain("Restart");
    expect(f).toContain("1 note is unsaved: index.md.");
    expect(f).toContain("● Save and restart");
    await shown(h, clock);
    await h.keys("escape");
    expect(h.quit.called).toBe(false);
    expect(h.app.dirtyBuffers()).toHaveLength(1);
    await h.app.updates.restart();
    await shown(h, clock);
    await h.keys("enter");
    expect(h.app.dirtyBuffers()).toHaveLength(0);
    expect(readFileSync(join(h.root, "index.md"), "utf8")).toStartWith("X");
    expect(h.quit.called).toBe(true);
    takeNote({ pid: process.pid, ppid: -1 });
  });

  test("a note that can't be saved stops it there, as :wqa stops, saying which: nothing quits", async () => {
    const { h, clock } = await clocked();
    withEnv(h);
    await h.keys("i", "X", "escape");
    await h.app.run("window.split_side");
    await h.app.run("note.open notes/alpha.md");
    await h.keys("i", "Y", "escape");
    writeFileSync(join(h.root, "index.md"), "changed on disk meanwhile, by another hand\n");
    await h.app.updates.restart();
    expect(h.frame()).toContain("2 notes are unsaved: index.md, notes/alpha.md.");
    await shown(h, clock);
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
    await shown(h, clock);
    await h.keys("enter");
    await Bun.sleep(10);
    expect(h.quit.called).toBe(true);
    expect(takeNote({ pid: process.pid, ppid: -1 })?.upgrade).toBe("0.6.0");
  });

  test("the question opened by Upgrade and restart's enter isn't answered by a second enter, nor a double click", async () => {
    for (const how of ["keys", "clicks"]) {
      const { h, clock } = await clocked(QUIET_MS);
      withEnv(h);
      await h.keys("i", "X", "escape");
      clock.now += QUIET_MS;
      h.app.updates.found(found);
      await shown(h, clock);
      if (how === "keys") await h.keys("enter", "enter");
      else {
        const row = h.app.geometry!.choices!.rows[0]!;
        for (let i = 0; i < 2; i++) {
          h.app.mouse.handle({ type: "down", x: row.x + 2, y: row.y, button: 0 });
          h.frame();
        }
      }
      await Bun.sleep(10);
      expect(h.frame()).toContain("1 note is unsaved: index.md.");
      expect(h.quit.called).toBe(false);
    }
  });

  test("a restart waiting for an upgrade beside the TUI, typed into meanwhile: its question waits for quiet", async () => {
    const { h, clock } = await clocked();
    withEnv(h, {
      execPath: fakeSlipbox({ ok: true, data: { status: "upgraded", from: "0.5.0", latest: "0.6.0", removed: [] } }, 1),
    });
    await h.keys("i", "X", "escape");
    h.app.updates.upgradeBeside("0.6.0");
    const restarting = h.app.updates.restart();
    clock.now += 100;
    await h.keys("i", "Y");
    await restarting;
    expect(h.app.overlay).toBeNull();
    expect(h.app.view?.insert).toBeTruthy();
    await h.keys("escape");
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.frame()).toContain("1 note is unsaved: index.md.");
  });

  test("a restart waiting for quiet, then :restart asked and cancelled: it doesn't come back, nor restart once saved", async () => {
    const { h, clock } = await clocked();
    withEnv(h, {
      execPath: fakeSlipbox({ ok: true, data: { status: "upgraded", from: "0.5.0", latest: "0.6.0", removed: [] } }, 1),
    });
    h.app.updates.upgradeBeside("0.6.0");
    const restarting = h.app.updates.restart();
    clock.now += 100;
    await h.keys("i", "X");
    await restarting;
    expect(h.app.overlay).toBeNull();
    // Waiting for quiet. Asked again, by its message's :restart: a note unsaved, so asked about; Cancel.
    await h.keys("escape", ":", ..."restart", "enter");
    expect(h.frame()).toContain("1 note is unsaved: index.md.");
    await shown(h, clock);
    await h.keys("escape");
    expect(h.app.overlay).toBeNull();
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.app.overlay).toBeNull();
    // The note saved, and a pause: nothing restarts.
    await h.keys(":", "w", "enter");
    expect(h.app.dirtyBuffers()).toHaveLength(0);
    clock.now += QUIET_MS;
    h.app.updates.tick();
    await Bun.sleep(10);
    expect(h.quit.called).toBe(false);
    expect(h.app.overlay).toBeNull();
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

/** A binary answering `--version` with `slipbox <version>`, each run noted in `<file>.runs`. */
function binary(file: string, version: string): string {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, `#!/bin/sh\necho run >> '${file}.runs'\necho 'slipbox ${version}'\n`);
  chmodSync(file, 0o755);
  return file;
}

/** `link` made to lead to `to`, in one step, as an installer or brew moves it. */
function relink(to: string, link: string): void {
  rmSync(`${link}.new`, { force: true });
  symlinkSync(to, `${link}.new`);
  renameSync(`${link}.new`, link);
}

/** How many times a binary was run. */
const runsOf = (file: string) =>
  existsSync(`${file}.runs`) ? readFileSync(`${file}.runs`, "utf8").split("\n").length - 1 : 0;

describe("an upgrade underneath (UPG-T6)", () => {
  test("the installer's current moved by another terminal: the restart offered once, when quiet — whatever the check says", async () => {
    const { h, clock } = await clocked(QUIET_MS);
    const data = mkdtempSync(join(sandbox, "data-"));
    for (const v of ["0.5.0", "0.6.0"]) mkdirSync(join(data, "versions", v), { recursive: true });
    symlinkSync("versions/0.5.0", join(data, "current"));
    withEnv(h, { data, env: { DO_NOT_TRACK: "1" } }, { on: false });
    h.app.updates.start();
    await h.app.updates.lookUnderneath();
    expect(h.app.overlay).toBeNull();
    relink("versions/0.6.0", join(data, "current"));
    h.app.lastInputAt = clock.now;
    await h.app.updates.lookUnderneath();
    expect(h.app.overlay).toBeNull();
    clock.now += QUIET_MS;
    h.app.updates.tick();
    const f = h.frame();
    expect(f).toContain("slipbox 0.6.0 is installed");
    expect(f).toContain("This is 0.5.0.");
    expect(f).toContain("● Restart now");
    expect(f).not.toContain("Skip this version");
    await shown(h, clock);
    await h.keys("j", "enter");
    expect(h.app.messages.at(-1)?.text).toBe("slipbox 0.6.0 is installed: :restart starts it");
    // Once.
    await h.app.updates.lookUnderneath();
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.app.overlay).toBeNull();
  });

  test("the installer's: a version newer than this one installed already at start — gone back to on purpose — isn't offered", async () => {
    const { h, clock } = await clocked(QUIET_MS);
    const data = mkdtempSync(join(sandbox, "data-"));
    for (const v of ["0.5.0", "0.6.0", "0.7.0"]) mkdirSync(join(data, "versions", v), { recursive: true });
    symlinkSync("versions/0.6.0", join(data, "current"));
    withEnv(h, { data });
    h.app.updates.start();
    await h.app.updates.lookUnderneath();
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.app.overlay).toBeNull();
    relink("versions/0.7.0", join(data, "current"));
    await h.app.updates.lookUnderneath();
    h.app.updates.tick();
    expect(h.frame()).toContain("slipbox 0.7.0 is installed");
  });

  test("this window's own background upgrade isn't offered again: its message said it", async () => {
    const { h, clock } = await clocked(QUIET_MS);
    const data = mkdtempSync(join(sandbox, "data-"));
    mkdirSync(join(data, "versions", "0.6.0"), { recursive: true });
    symlinkSync("versions/0.6.0", join(data, "current"));
    withEnv(h, { data });
    h.app.updates.mine.add("0.6.0");
    await h.app.updates.lookUnderneath();
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.app.overlay).toBeNull();
  });

  test("Homebrew's: its opt link moved to a new keg — a revision in its name — the binary asked its version", async () => {
    const { h, clock } = await clocked(QUIET_MS);
    const prefix = mkdtempSync(join(sandbox, "brew-"));
    const keg = binary(join(prefix, "Cellar", "slipbox", "0.5.0", "bin", "slipbox"), "0.5.0");
    binary(join(prefix, "Cellar", "slipbox", "0.6.0_1", "bin", "slipbox"), "0.6.0");
    mkdirSync(join(prefix, "opt"));
    symlinkSync("../Cellar/slipbox/0.5.0", join(prefix, "opt", "slipbox"));
    withEnv(h, { by: "homebrew", execPath: keg });
    h.app.updates.start();
    await h.app.updates.lookUnderneath();
    expect(h.app.updates.installedNewer()).toBeNull();
    relink("../Cellar/slipbox/0.6.0_1", join(prefix, "opt", "slipbox"));
    await h.app.updates.lookUnderneath();
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.frame()).toContain("slipbox 0.6.0 is installed");
    expect(h.app.updates.installedNewer()).toBe("0.6.0");
  });

  test("put here by hand: the path it was started by, a file copied over it or its link moved, asked its version", async () => {
    for (const how of ["copied", "linked"]) {
      const { h, clock } = await clocked(QUIET_MS);
      const dir = mkdtempSync(join(sandbox, "hand-"));
      const running = binary(join(dir, "slipbox-0.5.0"), "0.5.0");
      const started = join(dir, "slipbox");
      symlinkSync(running, started);
      withEnv(h, { by: "other", execPath: running, startedBy: started });
      h.app.updates.start();
      // What's there is this one, and unchanged: never started to ask it.
      await h.app.updates.lookUnderneath();
      await h.app.updates.lookUnderneath();
      expect(runsOf(running)).toBe(0);
      expect(h.app.overlay).toBeNull();
      if (how === "linked") relink(binary(join(dir, "slipbox-0.6.0"), "0.6.0"), started);
      else writeFileSync(running, "#!/bin/sh\necho 'slipbox 0.6.0'\n# a newer build, longer\n");
      await h.app.updates.lookUnderneath();
      await h.app.updates.lookUnderneath();
      // Asked once, when it changed.
      if (how === "linked") expect(runsOf(join(dir, "slipbox-0.6.0"))).toBe(1);
      clock.now += QUIET_MS;
      h.app.updates.tick();
      expect(h.frame()).toContain("slipbox 0.6.0 is installed");
    }
  });

  test("from source, nothing is looked at", async () => {
    const { h, clock } = await clocked(QUIET_MS);
    const data = mkdtempSync(join(sandbox, "data-"));
    mkdirSync(join(data, "versions", "0.6.0"), { recursive: true });
    symlinkSync("versions/0.6.0", join(data, "current"));
    withEnv(h, { data, release: null });
    await h.app.updates.lookUnderneath();
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.app.overlay).toBeNull();
  });
});

describe("round 2 (UPG)", () => {
  const slow = (version: string) =>
    fakeSlipbox({ ok: true, data: { status: "upgraded", from: "0.5.0", latest: version, removed: [] } }, 1);

  test("a restart waiting for quiet goes through restart again: an upgrade started meanwhile is waited for too", async () => {
    const { h, clock } = await clocked();
    withEnv(h, { execPath: slow("0.6.0") });
    await h.keys("i", "X", "escape");
    h.app.updates.upgradeBeside("0.6.0");
    const restarting = h.app.updates.restart();
    clock.now += 100;
    await h.keys("i", "Y");
    await restarting;
    // Queued; meanwhile another upgrade starts beside the TUI.
    withEnv(h, { execPath: slow("0.7.0") });
    h.app.updates.upgradeBeside("0.7.0");
    await h.keys("escape");
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.app.messages.at(-1)?.text).toBe("waiting for the upgrade to 0.7.0 to finish…");
    expect(h.app.overlay).toBeNull();
    await h.app.updates.background!.done;
    await Bun.sleep(10);
    expect(h.frame()).toContain("1 note is unsaved: index.md.");
    expect(h.quit.called).toBe(false);
  });

  test("nothing underneath is offered while this window's own upgrade runs, whatever version it installs", async () => {
    const { h, clock } = await clocked(QUIET_MS);
    const data = mkdtempSync(join(sandbox, "data-"));
    for (const v of ["0.5.0", "0.7.0"]) mkdirSync(join(data, "versions", v), { recursive: true });
    symlinkSync("versions/0.5.0", join(data, "current"));
    withEnv(h, { data, execPath: slow("0.7.0") });
    h.app.updates.start();
    h.app.updates.upgradeBeside("0.6.0");
    relink("versions/0.7.0", join(data, "current"));
    await h.app.updates.lookUnderneath();
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.app.overlay).toBeNull();
    await h.app.updates.background!.done;
  });

  test(":upgrade's answer, waiting where the daily check's offer of the same version waits, is offered: the check off", async () => {
    const { h, clock } = await clocked();
    const check = { on: true };
    withEnv(h, { fetcher: releasesOf("0.6.0").fetcher }, check);
    h.app.updates.found(found);
    await h.keys("i");
    check.on = false;
    await h.app.updates.check();
    await h.keys("escape");
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.frame()).toContain("slipbox 0.6.0 is out");
  });

  test(":upgrade asked twice before it's answered: one offer", async () => {
    const { h, clock } = await clocked();
    let answer = (_: Response) => {};
    const asked: string[] = [];
    const fetcher = (url: string) => (asked.push(url), new Promise<Response>((r) => (answer = r)));
    withEnv(h, { fetcher });
    const first = h.app.updates.check();
    await h.app.updates.check();
    expect(h.app.messages.at(-1)?.text).toBe("asking for the newest version already");
    expect(asked).toHaveLength(1);
    answer(new Response(`${"a".repeat(64)}  slipbox-0.6.0-linux-x64.tar.gz\n`));
    await first;
    expect(h.frame()).toContain("slipbox 0.6.0 is out");
    await shown(h, clock);
    await h.keys("escape");
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.app.overlay).toBeNull();
  });

  test(":restart asked twice while it waits for an upgrade: one question", async () => {
    const { h, clock } = await clocked();
    withEnv(h, { execPath: slow("0.6.0") });
    await h.keys("i", "X", "escape");
    h.app.updates.upgradeBeside("0.6.0");
    const first = h.app.updates.restart();
    await h.app.updates.restart();
    await first;
    expect(h.frame()).toContain("1 note is unsaved: index.md.");
    await shown(h, clock);
    await h.keys("escape");
    clock.now += QUIET_MS;
    h.app.updates.tick();
    expect(h.app.overlay).toBeNull();
  });

  test("a short screen: the help, then the text's lines go, so the choices and the keys stay on it", async () => {
    const { h } = await clocked(0, { height: 13 });
    offer(h);
    const rows = h.frame().split("\n");
    expect(rows).toHaveLength(13);
    expect(rows.some((r) => r.includes("● Upgrade and restart"))).toBe(true);
    expect(rows.some((r) => r.includes("☐ Skip this version"))).toBe(true);
    expect(rows.some((r) => r.includes("enter: do it"))).toBe(true);
  });

  test("a restart's note's session is read as the session file is: what this version can't read dropped", () => {
    const note = (session: unknown) => ({
      pid: 1,
      at: Date.now(),
      from: "0.5.0",
      upgrade: null,
      outcome: null,
      place: null,
      session,
    });
    const back = cameBack(note({ version: 1, tabs: [{ panes: [{ path: 5 }, { path: "a.md" }] }, "junk"] }), "0.6.0");
    expect(back.session?.tabs.map((t) => t.panes.map((p) => p.path))).toEqual([["a.md"]]);
    expect(cameBack(note({ version: 2, tabs: [] }), "0.6.0").session).toBeNull();
  });

  test(":upgrade's command line is slipbox upgrade --check: it asks, installs nothing", () => {
    expect(COMMAND_SPECS.find((c) => c.id === "app.upgrade")?.cli).toBe("slipbox upgrade --check");
  });
});
