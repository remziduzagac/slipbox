import { cpSync, existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  type Check,
  explorerOpen,
  explorerRow,
  HANDBOOK,
  inSwitcher,
  leader,
  MEETING,
  moveTo,
  opened,
  pos,
} from "../check.ts";
import { type Session, sleep } from "../session.ts";
import { messagesSaying } from "../support/links.ts";
import { append, KENJI, onto } from "../support/outside-and-code.ts";

/** The vault's index written to the cache: every note parsed (the graph writes it when none is left). */
function indexCached(s: Session): boolean {
  const dir = join(s.dir, "cache", "slipbox");
  return existsSync(dir) && readdirSync(dir).some((k) => existsSync(join(dir, k, "index.json")));
}

/** The status line's `L12:3`'s line, waited for until `ok`. */
async function lineIs(s: Session, ok: (line: number) => boolean, what: string): Promise<void> {
  await s.until(() => ok(pos(s).line), 5000, what);
}

export const WATCHING: Check[] = [
  // --- the watcher --------------------------------------------------------------------------------
  {
    area: "outside-and-code",
    name: "watching: a clean note changed outside reloads at once, marked ↻; u brings its text back, ctrl+r theirs again",
    covers: { cases: ["watching"] },
    options: { open: KENJI },
    run: async (s) => {
      await s.see("second desk by the window");
      s.write(KENJI, s.read(KENJI).replace("second desk by the window", "third desk, by the door"));
      await s.see("third desk, by the door", 5000);
      await s.status("↻ reloaded");
      s.expect(!s.text().includes("second desk by the window"), "the old text gone from the screen");
      // The reload is an undo step of its own: u brings back what was there, unsaved now (the file is theirs).
      await s.keys("u");
      await s.see("second desk by the window");
      await s.notSee("third desk, by the door");
      await s.status("• unsaved");
      await s.keys("ctrl+r");
      await s.see("third desk, by the door");
      await s.until(() => !s.statusLine().includes("unsaved"), 3000, "back at the file's text: nothing unsaved");
      s.expect(s.read(KENJI).includes("third desk, by the door"), "nothing written: the file is still theirs");
    },
  },
  {
    area: "outside-and-code",
    name: "watching: a note reached in a hidden folder, changed by an agent, reloads once — looked at where no watcher is (20.8)",
    covers: { cases: ["watching"], commands: ["note.open", "backlinks.open"] },
    options: {
      // The watcher's sweep each 3 s (15 ticks of 200 ms): soon enough to see it doesn't say the change again.
      config: "[watch]\npoll_ms = 200\n",
      setup: (s) => {
        if (!s.exists(".stash/kept.md")) s.write(".stash/kept.md", "# Kept aside\n\nNothing here yet.\n");
        if (!s.exists(".aside.md")) s.write(".aside.md", "# Aside\n\nA hidden note at the top.\n");
      },
    },
    run: async (s) => {
      // :e reaches it: the vault's note from now on, its folder still hidden from the watcher. Started again, the
      // index brings it back, and the watcher knows it too (its sweep stats every note it knows).
      await s.ex("e .stash/kept.md");
      await opened(s, ".stash/kept.md");
      await s.restart();
      await s.ex("e .stash/kept.md");
      await opened(s, ".stash/kept.md");
      await s.see("Nothing here yet.");
      s.write(".stash/kept.md", "# Kept aside\n\nAn agent wrote here, to [home](../home.md).\n");
      await s.see("An agent wrote here", 5000);
      await s.status("↻ reloaded");
      // Said once: the watcher's sweep, which knows the note too, doesn't say it again.
      await sleep(4000);
      const said = await messagesSaying(s, "kept.md changed", /kept\.md changed on disk — reloaded/);
      s.expect(said === 1, `the reload said once, not ${said} times`);
      // The index told too: the new link's in it, and home.md's backlinks list the note.
      await s.ex("e home.md");
      await opened(s, "home.md");
      await leader(s, "l", "b");
      await s.see(/Linking to home\.md/, 5000);
      await s.see(/\.stash\/kept\.md\s+home\b/);
      await s.keys("escape");
      // A hidden note in a folder the watcher watches (the top): its name the watch doesn't take, the poll does.
      await s.ex("e .aside.md");
      await opened(s, ".aside.md");
      s.write(".aside.md", "# Aside\n\nRewritten by an agent.\n");
      await s.see("Rewritten by an agent.", 5000);
    },
  },
  {
    area: "outside-and-code",
    name: "watching: a note reached in a hidden folder, deleted and made again by an agent — read again and indexed again, its backlink there",
    covers: { cases: ["watching"], commands: ["note.open", "backlinks.open"] },
    options: {
      setup: (s) => {
        if (!s.exists(".stash/back.md")) s.write(".stash/back.md", "# Back\n\nTo [home](../home.md).\n");
      },
    },
    run: async (s) => {
      await s.ex("e .stash/back.md");
      await opened(s, ".stash/back.md");
      // Gone, then made again while it's open: no watcher sees its folder, the poll does.
      rmSync(s.path(".stash/back.md"));
      await s.message(/back\.md was deleted on disk/, 5000);
      s.write(".stash/back.md", "# Back again\n\nTo [home](../home.md), once more.\n");
      await s.see("once more", 5000);
      // Reached again, as opening it reaches it: in the index, home.md's backlinks list it — its row, its link's text
      // beside it (the messages name its path too).
      await s.ex("e home.md");
      await opened(s, "home.md");
      await leader(s, "l", "b");
      await s.see(/Linking to home\.md/, 5000);
      await s.see(/\.stash\/back\.md\s+home\b/, 3000);
      await s.keys("escape");
    },
  },
  {
    area: "outside-and-code",
    name: "watching: a note reached in a hidden folder, the folder made a file by an agent — said deleted, slipbox goes on",
    covers: { cases: ["watching"], commands: ["note.open"] },
    options: {
      setup: (s) => {
        if (!s.exists(".junk/gone.md")) s.write(".junk/gone.md", "# Gone soon\n");
      },
    },
    run: async (s) => {
      await s.ex("e .junk/gone.md");
      await opened(s, ".junk/gone.md");
      // The folder made a file: looking at the note through it fails (ENOTDIR), and is taken as the note gone.
      rmSync(s.path(".junk"), { recursive: true });
      s.write(".junk", "A file now.\n");
      await s.message(/gone\.md was deleted on disk/, 5000);
      // Still here, answering.
      await s.keys("ctrl+p");
      await s.see(/Open \(\d+ notes/, 5000);
      await s.keys("escape");
    },
  },
  {
    area: "outside-and-code",
    name: "watching: links turn live and broken as notes come and go",
    covers: { cases: ["watching"] },
    options: { open: "people/partners-and-names.md" },
    run: async (s) => {
      // The link to a note not written yet, under the cursor: its status in the status line.
      await onto(s, "visiting rota, which");
      await s.status("→ visiting-rota.md (unresolved)");
      s.write("people/visiting-rota.md", "# Visiting rota\n");
      await s.status("→ visiting-rota.md (resolved)", 5000);
      rmSync(s.path("people/visiting-rota.md"));
      await s.status("→ visiting-rota.md (unresolved)", 5000);
    },
  },
  {
    area: "outside-and-code",
    name: "watching: the open note deleted is marked, its last text kept; back, reloaded; a new deep folder is watched",
    covers: { cases: ["watching"] },
    options: { open: KENJI },
    run: async (s) => {
      await s.see("Visiting astronomer from the Kiso-Hara");
      const kenji = s.read(KENJI);
      rmSync(s.path(KENJI));
      await s.status("✖ deleted on disk", 5000);
      await s.see("Visiting astronomer from the Kiso-Hara");
      s.write(KENJI, kenji.replace("Visiting astronomer", "Visiting astronomer (back)"));
      await s.see("Visiting astronomer (back)", 5000);
      await s.until(() => !s.statusLine().includes("✖"), 3000, "the deleted mark gone once it's back");
      // A folder made three deep at once: its note found, and its later changes seen (watched through its depth).
      s.write("field-notes/2026/october/aurora.md", "# Aurora over the ridge\n\nFirst seen at 01:40.\n");
      await inSwitcher(s, "aurora", "field-notes/2026/october/aurora.md");
      await s.keys("enter");
      await s.status("aurora.md");
      s.write(
        "field-notes/2026/october/aurora.md",
        "# Aurora over the ridge\n\nFirst seen at 01:40.\n\nSeen again at 02:10.\n",
      );
      await s.see("Seen again at 02:10.", 5000);
    },
  },
  {
    area: "outside-and-code",
    name: "watching: a note an agent writes at the vault's top — in the explorer from the disk at once, in the switcher once the watcher tells, opened from it (#69)",
    covers: { cases: ["watching", "explorer"], commands: ["switcher.open", "explorer.toggle_hidden"] },
    // The watcher slow to tell, as a loaded runner's is.
    options: { config: "[watch]\ndebounce_ms = 3000\n" },
    run: async (s) => {
      s.write("arrival.md", "# Arrival\n\nWritten by an agent.\n");
      // The explorer's tree made again before the watcher has told (hidden files shown, then not): its row is the
      // disk's, while the switcher doesn't list the note yet.
      await s.ex("hidden");
      await s.ex("hidden");
      await s.see("arrival.md");
      await inSwitcher(s, "arrival", "arrival.md");
      await s.keys("enter");
      await opened(s, "arrival.md");
      await s.see("Written by an agent.");
    },
  },
  {
    area: "outside-and-code",
    name: "watching: an agent's prepend keeps the cursor on its line",
    covers: { cases: ["watching"], commands: ["cursor.goto_line"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      // The cursor on line 300; four lines prepended: still on the same text, now line 304.
      await moveTo(s, ["ctrl+g"], () => true, "the line prompt");
      await s.type("300");
      await moveTo(s, ["enter"], (l) => l === 300, "ctrl+g 300 to line 300");
      s.write(HANDBOOK, `<!-- prepended -->\nAn agent's line.\n\n<!-- end -->\n${s.read(HANDBOOK)}`);
      await lineIs(s, (l) => l === 304, "the cursor to follow its line to 304");
      await s.status("↻ reloaded");
    },
  },
  {
    area: "outside-and-code",
    name: "watching: an agent's append keeps the lens on its lines",
    covers: { cases: ["watching", "lens"], commands: ["view.live"] },
    options: { open: MEETING },
    run: async (s) => {
      // The lens on a block: an append at the end of the note leaves its lines and size as they were.
      await s.keys("]", "]", "j", "j");
      await leader(s, "n", "l");
      await s.status("LENS");
      const lens = () => /source · lines? (\d+(?:–\d+)?)/.exec(s.text())?.[1] ?? "";
      await s.until(() => lens() !== "", 3000, "the lens's lines");
      const lines = lens();
      append(s, "Appended by an agent.");
      await s.status("↻ reloaded", 5000);
      await s.status("LENS");
      s.expect(lens() === lines, `the lens still on lines ${lines} (now ${lens()})`);
    },
  },
  {
    area: "outside-and-code",
    name: "watching: a note an agent adds keeps the explorer on the row it was on",
    covers: { cases: ["watching", "explorer"] },
    run: async (s) => {
      // The explorer on home.md; a note an agent adds sorts above it: the selection stays on home.md.
      await explorerOpen(s);
      await explorerRow(s, "home");
      s.write("aaa-agent-note.md", "# An agent's note\n");
      await s.see("aaa-agent-note", 5000);
      await s.keys("enter");
      await s.status("home.md");
      s.expect(
        !s.statusLine().includes("aaa-agent-note"),
        "enter opened the row selected before the note came, not the row now in its place",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "watching: a note moved by hand — mv, then cp and rm the other way round — the relink offered at once; declined, its links say where, space l r relinks",
    covers: { cases: ["watching"], commands: ["link.relink"] },
    // `[kenji-mori](../people/kenji-mori.md)` on line 10.
    options: { open: MEETING },
    run: async (s) => {
      await s.see("gets Aster on Tuesday and Thursday nights.");
      // Every note's text known first: the index is cached once all are parsed. (A note moved in the
      // moment after a first, cold open, before its parse, has no text to be known by.)
      await s.until(() => indexCached(s), 5000, "the vault's notes all parsed (its index cached)");
      // mv: gone from one path, the same text at another — a move (17.12), never a quiet resolve: the
      // links it broke, their fix offered at once (21.11); enter takes it.
      renameSync(s.path(KENJI), s.path("people/kenji.md"));
      await s.see(/relink: \d+ changes? in \d+ files?/, 5000); // every note's links to it, home's too
      await s.message("moved to people/kenji.md");
      await s.keys("enter");
      await s.file(MEETING, (t) => t.includes("[kenji-mori](../people/kenji.md)"), "relinked to where it went");
      // The other way round: the copy arrives first, then the original goes. The offer declined, the
      // link says where it went, and space l r relinks it.
      cpSync(s.path("people/kenji.md"), s.path("people/k-mori.md"));
      await sleep(300); // two events, not one batch: the arrival seen before the removal
      rmSync(s.path("people/kenji.md"));
      await s.see(/relink: \d+ changes? in \d+ files?/, 5000);
      await s.keys("escape");
      await s.notSee(/relink: \d+ changes? in \d+ files?/);
      await onto(s, "kenji-mori");
      await s.status(/→ \S*people\/kenji\.md \(unresolved\)/, 5000);
      await s.keys("enter");
      await s.message("people/k-mori.md: space l r relinks it", 5000); // "… moved to" ends the row above
      await leader(s, "l", "r");
      await s.see("relink: 1 change in 1 file", 5000); // this note's
      await s.keys("enter");
      await s.file(MEETING, (t) => t.includes("[kenji-mori](../people/k-mori.md)"), "relinked again");
    },
  },
  {
    area: "outside-and-code",
    name: "watching: an embedded note changed on disk — the note embedding it draws the new text",
    covers: { cases: ["watching", "embeds"] },
    options: { open: "people/partners-and-names.md" },
    run: async (s) => {
      await s.see("Table A — ordinary prose, no long tokens.");
      s.write(
        "scratch/wrap-probe.md",
        s.read("scratch/wrap-probe.md").replace("Table A — ordinary prose", "Table A — rewritten prose"),
      );
      await s.see("Table A — rewritten prose, no long tokens.", 5000);
      await s.notSee("Table A — ordinary prose");
    },
  },
  {
    area: "outside-and-code",
    name: "reload: not watching — an outside write waits for space n r, or :reload, which reloads it",
    covers: { cases: ["watching", "reload"], commands: ["note.reload"] },
    options: { open: KENJI, config: "[watch]\nenabled = false\n" },
    run: async (s) => {
      await s.see("second desk by the window");
      await s.status("not watching");
      s.write(KENJI, s.read(KENJI).replace("second desk by the window", "third desk, by the door"));
      // Nothing reloads it by itself with the watcher off: a while later, the old text still shows.
      await sleep(2000);
      s.expect(
        s.text().includes("second desk by the window") && !s.text().includes("third desk"),
        "the outside write not shown before space n r",
      );
      await leader(s, "n", "r");
      await s.see("third desk, by the door");
      await s.status("↻ reloaded");
      // :reload likewise.
      s.write(KENJI, s.read(KENJI).replace("third desk, by the door", "fourth desk, upstairs"));
      await s.ex("reload");
      await s.see("fourth desk, upstairs");
    },
  },
];
