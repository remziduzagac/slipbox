// Upgrading and restarting from the TUI (UPG): the update offer and its choices, the restart into the new version where
// you were, an upgrade underneath offered as the restart. They drive two real release builds of this checkout
// (release-builds.ts, once a run): the first installed in the check's data folder as the installer lays it out — or as
// Homebrew does, or put somewhere by hand — the second served as a release from a folder. One, the restart's question
// about notes unsaved, runs from source.

import {
  chmodSync,
  copyFileSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { VERSION } from "../../../src/version.ts";
import { type Check, open } from "../check.ts";
import { type Releases, releasesBuilt } from "../releases.ts";
import { type Session, Skipped, sleep } from "../session.ts";
import { lastMessage } from "./links-and-files.ts";

/** The run's two release builds; without them the check is skipped, saying why. */
function builds(): Releases {
  const r = releasesBuilt();
  if (!r) throw new Skipped("the release builds weren't made: run it with bun run test:terminal");
  return r;
}

/** `from` put at `to`: the same file, linked (at once, whatever its size), or a copy across disks. */
function place(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  try {
    linkSync(from, to);
  } catch {
    copyFileSync(from, to);
    chmodSync(to, 0o755);
  }
}

/** `link` made to lead to `to`, in one step. */
function relink(to: string, link: string): void {
  rmSync(`${link}.new`, { force: true });
  symlinkSync(to, `${link}.new`);
  renameSync(`${link}.new`, link);
}

const DATA = (s: Session) => join(s.dir, "data", "slipbox");

/** The old build installed as the installer lays it out, in the check's data folder: started through `current`. */
function installed(s: Session): void {
  const r = builds();
  place(r.oldBin, join(DATA(s), "versions", r.old, "slipbox"));
  symlinkSync(`versions/${r.old}`, join(DATA(s), "current"));
}

/** The installer's install, its releases the run's folder offering the newer build. */
const INSTALLED = {
  setup: installed,
  bin: "{dir}/data/slipbox/current/slipbox",
  env: { SLIPBOX_RELEASES_URL: "file://{releases}" },
};

/** The version `current` names. */
const current = (s: Session) => readlinkSync(join(DATA(s), "current")).replace(/^versions\//, "");

/** A dialog opened on its own drops what arrives in its first half second: a key after that. */
const PAST_THE_DROP = 600;

/** The offer, opened by the daily check once nothing was typed for two seconds. */
async function offered(s: Session, r: Releases): Promise<void> {
  await s.see(`slipbox ${r.new} is out`, 20_000);
  await s.see(`This is ${r.old}.`);
  await sleep(PAST_THE_DROP);
}

/** What a restart said, coming back: its message, as a box. */
const restarted = (s: Session, now: string, was: string) => s.see(`restarted: slipbox ${now} (was ${was})`, 30_000);

/**
 * A message said: its start seen in its box (one longer than a box's row wraps there), then the whole of it read from
 * the messages list, holding `text`.
 */
async function said(s: Session, text: string, timeout?: number): Promise<string> {
  const start = text.slice(0, 30);
  await s.see(start, timeout);
  const whole = await lastMessage(s, start);
  s.expect(whole.includes(text), `said: ${text}\n(the message: ${whole})`);
  return whole;
}

/** When each check's slow server was first asked for the pack (`slowReleases`): the download under way. */
const packAsked: Promise<void>[] = [];

/** The releases served from a local server, the pack held back `holdMs`: its address put in the session's env. */
function slowReleases(s: Session, holdMs: number): void {
  const r = builds();
  let asked = () => {};
  packAsked.push(new Promise<void>((resolve) => (asked = resolve)));
  const sums = readFileSync(join(r.releases, "latest", "download", "SHA256SUMS"));
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      if (path.endsWith("/SHA256SUMS")) return new Response(sums);
      asked();
      await sleep(holdMs);
      return new Response(Bun.file(join(r.releases, path)));
    },
  });
  s.extraEnv.SLIPBOX_RELEASES_URL = `http://127.0.0.1:${server.port}`;
}

/** `:restart`, from the `:` line. */
const restart = (s: Session) => s.ex("restart");

export const UPDATES: Check[] = [
  {
    area: "outside-and-code",
    name: "updates: the offer once quiet; Upgrade and restart starts the new version in this process, its windows as they were",
    covers: { commands: ["app.restart"] },
    releases: true,
    options: INSTALLED,
    async run(s) {
      const r = builds();
      await s.ex("vs");
      await open(s, "writing-guide");
      await offered(s, r);
      s.expect(s.rowOf("● Upgrade and restart") >= 0, "Upgrade and restart offered, and marked");
      s.expect(s.rowOf("○ Upgrade, restart later") >= 0, "Upgrade, restart later offered");
      s.expect(s.rowOf("☐ Skip this version") >= 0, "Skip this version offered, unticked");
      const pid = s.pid();
      await s.keys("enter");
      await restarted(s, r.new, r.old);
      s.expect(s.pid() === pid, `the same process to the shell: pid ${pid}, now ${s.pid()}`);
      // Replaced, not waiting on a child: on Linux, the process runs the new version's file itself.
      if (process.platform === "linux") {
        const exe = readlinkSync(`/proc/${pid}/exe`);
        s.expect(exe === join(DATA(s), "versions", r.new, "slipbox"), `the process runs ${exe}`);
      }
      s.expect(current(s) === r.new, `current names ${r.new}: ${current(s)}`);
      s.expect(s.rowOf(/home\.md.*writing-guide\.md/) >= 0, "both windows back, side by side");
      await s.status("writing-guide");
      // Restarted again, nothing to upgrade: the same version, where it was.
      await restart(s);
      await restarted(s, r.new, r.new);
      s.expect(s.pid() === pid, "still the same process");
    },
  },
  {
    area: "outside-and-code",
    name: "updates: a restart asks first about notes unsaved — Cancel restarts nothing, Save and restart saves them (from source)",
    covers: { commands: ["app.restart"] },
    async run(s) {
      // The first i opens the lens (editor.edit_in's default), the second types.
      await s.keys("i");
      await s.status("LENS");
      await s.keys("i");
      await s.status("INSERT");
      await s.type("Unsaved here. ");
      await s.keys("escape");
      await restart(s);
      await s.see("1 note is unsaved: home.md.");
      s.expect(s.rowOf("● Save and restart") >= 0, "Save and restart offered, and marked");
      await sleep(PAST_THE_DROP);
      await s.keys("escape");
      await s.notSee("1 note is unsaved");
      s.expect(!s.read("home.md").includes("Unsaved here."), "Cancel saved nothing");
      const pid = s.pid();
      await restart(s);
      await s.see("1 note is unsaved: home.md.");
      await sleep(PAST_THE_DROP);
      await s.keys("enter");
      await restarted(s, VERSION, VERSION);
      s.expect(s.read("home.md").includes("Unsaved here."), "Save and restart saved it");
      s.expect(s.pid() === pid, "Bun, with the same script, in the same process");
    },
  },
  {
    area: "outside-and-code",
    name: "updates: a failed upgrade starts the version that was running, saying why; :upgrade offers it with the check off",
    covers: { commands: ["app.upgrade"] },
    releases: true,
    options: {
      ...INSTALLED,
      config: "[update]\ncheck = false\n",
      env: { SLIPBOX_RELEASES_URL: "file://{dir}/bad" },
      setup: (s) => {
        installed(s);
        // The releases, their sum wrong.
        const r = builds();
        const pack = r.pack;
        place(join(r.releases, "download", `v${r.new}`, pack), join(s.dir, "bad", "download", `v${r.new}`, pack));
        mkdirSync(join(s.dir, "bad", "latest", "download"), { recursive: true });
        writeFileSync(join(s.dir, "bad", "latest", "download", "SHA256SUMS"), `${"0".repeat(64)}  ${pack}\n`);
      },
    },
    async run(s) {
      const r = builds();
      await sleep(2500);
      s.expect(s.rowOf("is out") < 0, "the check off: nothing offered");
      await s.ex("upgrade");
      await s.see(`slipbox ${r.new} is out`);
      await sleep(PAST_THE_DROP);
      await s.keys("enter");
      const whole = await said(s, `the upgrade to ${r.new} failed: the download's SHA-256 is`, 30_000);
      s.expect(whole.endsWith(`— this is ${r.old}`), `said as the version that was running: ${whole}`);
      s.expect(current(s) === r.old, `current still names ${r.old}: ${current(s)}`);
    },
  },
  {
    area: "outside-and-code",
    name: "updates: Not now, and Skip this version — ticking it marks Not now — kept; :upgrade offers it all the same",
    covers: { commands: ["app.upgrade"] },
    releases: true,
    options: INSTALLED,
    async run(s) {
      const r = builds();
      const state = () => JSON.parse(s.read(`${s.dir}/state/slipbox/update.json`));
      await offered(s, r);
      await s.keys("k", "k", "enter");
      await s.notSee("is out");
      s.expect(state().skipped === undefined, "Not now skips nothing");
      await s.ex("upgrade");
      await s.see(`slipbox ${r.new} is out`);
      await sleep(PAST_THE_DROP);
      await s.keys("k", "space");
      await s.see("☑ Skip this version");
      await s.keys("enter");
      await said(s, `slipbox ${r.new} skipped: the next newer one is offered`);
      s.expect(state().skipped === r.new, `skipped kept: ${JSON.stringify(state())}`);
      await s.ex("upgrade");
      await s.see(`slipbox ${r.new} is out`);
      await sleep(PAST_THE_DROP);
      await s.keys("escape");
      s.expect(current(s) === r.old, "nothing installed");
    },
  },
  {
    area: "outside-and-code",
    name: "updates: Upgrade, restart later — installed beside the TUI, said, and :restart starts it",
    covers: { commands: ["app.restart"] },
    releases: true,
    options: INSTALLED,
    async run(s) {
      const r = builds();
      await offered(s, r);
      await s.keys("j", "enter");
      await said(s, `slipbox ${r.new} is installed (this is ${r.old}): :restart starts it`, 30_000);
      s.expect(current(s) === r.new, `current names ${r.new}`);
      await restart(s);
      await restarted(s, r.new, r.old);
    },
  },
  {
    area: "outside-and-code",
    name: "updates: quitting while an upgrade runs beside the TUI quits at once, and the upgrade finishes",
    covers: { commands: ["app.quit"] },
    releases: true,
    options: {
      ...INSTALLED,
      env: {},
      setup: (s) => {
        installed(s);
        // The releases served slowly: the pack held back three seconds.
        slowReleases(s, 3000);
      },
    },
    async run(s) {
      const r = builds();
      await offered(s, r);
      await s.keys("j", "enter");
      await s.see(`upgrading to ${r.new}…`);
      const at = performance.now();
      await s.ex("qa");
      await s.until(() => s.exited(), 5000, "slipbox to quit");
      s.expect(performance.now() - at < 2500, `quit at once: ${Math.round(performance.now() - at)} ms`);
      s.expect(current(s) === r.old, "not installed yet as it quit");
      // slipbox gone, its upgrade goes on: waited for here, not on the screen.
      const end = performance.now() + 60_000;
      while (current(s) !== r.new && performance.now() < end) await sleep(200);
      s.expect(current(s) === r.new, `the upgrade to ${r.new} finished after it: current names ${current(s)}`);
    },
  },
  {
    area: "outside-and-code",
    name: "updates: keys typed while the hand-over upgrades are thrown away, never commands for the new version",
    covers: { commands: ["app.restart"] },
    releases: true,
    options: {
      ...INSTALLED,
      env: {},
      setup: (s) => {
        installed(s);
        slowReleases(s, 3000);
      },
    },
    async run(s) {
      const r = builds();
      await offered(s, r);
      // Sent, not waited on: slipbox quits, and no frame comes until the new one draws.
      s.term.write("\r");
      // The hand-over downloading (its server asked for the pack, held three seconds): no slipbox reads the terminal.
      await Promise.race([packAsked[0], sleep(15_000).then(() => s.expect(false, "the pack asked for"))]);
      // Typed at the terminal meanwhile: would quit the new one, were it read.
      s.term.write(":qa\r");
      await restarted(s, r.new, r.old);
      await sleep(1500);
      s.expect(!s.exited(), "the new slipbox still running: what was typed meanwhile was thrown away");
      // And it answers keys typed now.
      await restart(s);
      await restarted(s, r.new, r.new);
    },
  },
  {
    area: "outside-and-code",
    name: "updates: an upgrade underneath — another terminal's slipbox upgrade — offered as the restart, the check off",
    covers: { commands: ["app.restart"] },
    releases: true,
    options: { ...INSTALLED, config: "[update]\ncheck = false\n" },
    async run(s) {
      const r = builds();
      const upgraded = Bun.spawnSync([join(DATA(s), "versions", r.old, "slipbox"), "upgrade"], {
        env: { ...process.env, ...s.env(), SLIPBOX_RELEASES_URL: `file://${r.releases}` },
        stdout: "pipe",
        stderr: "pipe",
      });
      s.expect(upgraded.exitCode === 0, `slipbox upgrade in another terminal: ${upgraded.stderr.toString()}`);
      await s.see(`slipbox ${r.new} is installed`, 30_000);
      s.expect(s.rowOf("● Restart now") >= 0, "Restart now offered, and marked");
      s.expect(s.rowOf("Skip this version") < 0, "the restart alone");
      await sleep(PAST_THE_DROP);
      await s.keys("j", "enter");
      await s.see(`slipbox ${r.new} is installed: :restart starts it`);
      await restart(s);
      await restarted(s, r.new, r.old);
    },
  },
  {
    area: "outside-and-code",
    name: "updates: Homebrew's offer copies brew upgrade slipbox; brew's upgrade offers the restart, into opt's version",
    covers: { commands: ["app.restart"] },
    releases: true,
    options: {
      bin: "{dir}/brew/Cellar/slipbox/old/bin/slipbox",
      env: { SLIPBOX_RELEASES_URL: "file://{releases}" },
      setup: (s) => {
        const r = builds();
        place(r.oldBin, join(s.dir, "brew", "Cellar", "slipbox", "old", "bin", "slipbox"));
        mkdirSync(join(s.dir, "brew", "opt"));
        symlinkSync("../Cellar/slipbox/old", join(s.dir, "brew", "opt", "slipbox"));
      },
    },
    async run(s) {
      const r = builds();
      await offered(s, r);
      s.expect(s.rowOf("● Copy brew upgrade slipbox") >= 0, "brew's command offered to copy");
      s.expect(s.rowOf("Upgrade and restart") < 0, "Homebrew's left to brew");
      await s.keys("enter");
      await s.until(() => s.clipboard().includes("brew upgrade slipbox"), undefined, "brew's command copied");
      // brew upgrade: a new keg, a revision in its name, opt moved to it.
      place(r.newBin, join(s.dir, "brew", "Cellar", "slipbox", `${r.new}_1`, "bin", "slipbox"));
      relink(`../Cellar/slipbox/${r.new}_1`, join(s.dir, "brew", "opt", "slipbox"));
      await s.see(`slipbox ${r.new} is installed`, 30_000);
      await sleep(PAST_THE_DROP);
      await s.keys("j", "enter");
      await restart(s);
      await restarted(s, r.new, r.old);
    },
  },
  {
    area: "outside-and-code",
    name: "updates: one put by hand copies the releases' address; a newer file put there offers the restart, into it",
    covers: { commands: ["app.upgrade"] },
    releases: true,
    options: {
      bin: "{dir}/bin/slipbox",
      env: { SLIPBOX_RELEASES_URL: "file://{releases}" },
      setup: (s) => place(builds().oldBin, join(s.dir, "bin", "slipbox")),
    },
    async run(s) {
      const r = builds();
      await offered(s, r);
      s.expect(s.rowOf("● Copy the releases' address") >= 0, "the releases' address offered to copy");
      await s.keys("enter");
      await s.until(() => s.clipboard().includes(`file://${r.releases}`), undefined, "the address copied");
      // Asked again: the same offer, at once.
      await s.ex("upgrade");
      await s.see("● Copy the releases' address");
      await sleep(PAST_THE_DROP);
      await s.keys("escape");
      // A newer one put in its place, as you would: beside it, then moved over it.
      place(r.newBin, join(s.dir, "bin", "slipbox.new"));
      renameSync(join(s.dir, "bin", "slipbox.new"), join(s.dir, "bin", "slipbox"));
      await s.see(`slipbox ${r.new} is installed`, 30_000);
      await sleep(PAST_THE_DROP);
      await s.keys("enter");
      await restarted(s, r.new, r.old);
    },
  },
];
