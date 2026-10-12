// What writing the docs found (the DF workstream), fixed, in a real terminal: typing as in a desktop editor, a reload
// that asks to discard, which-key's prefixes, a picture's link, the trash emptied, a move into a folder, pointers to a
// cloned repository, search leaving worktrees out, a missing heading or block, the code view's comments and syntax
// errors, Obsidian's highlights and comments, a folder's config that may not reach the network, an export into a new
// folder. The mouse can't be sent through herdr: the headless tests click.

import { appendFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { exported, leader, moveTo, open, pos, type Scenario, signed } from "./helpers.ts";
import type { Session } from "./session.ts";

/** The status line naming `path` as the file open — not the link under the cursor (`→ /x.md`). */
async function opened(s: Session, path: string): Promise<void> {
  await s.status(new RegExp(`\\s${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`));
}

/** Follow the link whose text starts with `text`: found, the find row closed, enter. */
async function follow(s: Session, text: string): Promise<void> {
  await s.keys("/");
  await s.type(text);
  await s.keys("enter", "escape", "enter");
}

/** A home of the scenario's own (world-export.ts's), so the Save As window's places are never yours. */
const HOME = { env: { HOME: "{dir}/home" }, beside: { "home/.keep": "" } };

/** The newest message holding `needle`, whole (the list cuts it, its box wraps it): the messages list filtered, enter copies it. */
async function lastMessage(s: Session, needle: string): Promise<string> {
  await leader(s, "m");
  await s.see("Messages");
  await s.type(needle);
  await s.keys("enter");
  await s.notSee("Messages");
  return s.clipboard();
}

/** The rows of the list on screen that name the worktree of kestrel's agent branch. */
const worktreeRows = (s: Session) => s.screen().filter((r) => r.includes("kestrel-agent-sync-retry"));

export const FIXES_SCENARIOS: Scenario[] = [
  {
    name: "typing: as in a desktop editor — shift+arrows select, typing replaces, ctrl+z and ctrl+y while typing, pagedown; shift+right then d in normal mode (DF-D15)",
    options: {
      open: "desk.md",
      files: {
        "desk.md": `one two three\nfour five\n${Array.from({ length: 150 }, (_, i) => `line ${i + 3}`).join("\n")}\n`,
      },
    },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("g", "g", "i");
      await s.status("INSERT");
      // shift+right three times, as a terminal sends it: "one" selected; typing replaces it.
      for (let i = 0; i < 3; i++) await s.keys("shift+right");
      await s.type("ONE");
      await s.see("ONE two three");
      await s.notSee("ONEone");
      // ctrl+z undoes while typing, and typing goes on; ctrl+y redoes.
      await s.keys("ctrl+z");
      await s.see("one two three");
      await s.notSee("ONE two three");
      await s.status("INSERT");
      await s.keys("ctrl+y");
      await s.see("ONE two three");
      await s.status("INSERT");
      // pagedown moves a page while typing, still typing: what's typed lands there.
      await moveTo(s, ["pagedown"], (l) => l > 20, "pagedown a page down while typing");
      await s.status("INSERT");
      const paged = pos(s).line;
      await s.keys("home");
      await s.type("PAGED ");
      await s.keys("escape");
      await s.status("SOURCE");
      // Not typing: shift+right selects (a visual selection), d deletes it.
      await s.keys("g", "g", "w");
      await moveTo(s, ["shift+right", "shift+right"], (l, c) => l === 1 && c === 7, "shift+right twice over two");
      await s.status("VISUAL");
      await s.keys("d");
      await s.see("ONE  three");
      await s.keys("ctrl+s");
      await s.file(
        "desk.md",
        (t) => t.startsWith("ONE  three\nfour five\n"),
        "ONE typed over one, two deleted, written",
      );
      const lines = s.read("desk.md").split("\n");
      s.expect(
        lines[paged - 1]?.startsWith("PAGED line ") === true,
        `PAGED typed on line ${paged}, where pagedown went:\n${lines.slice(paged - 3, paged + 2).join("\n")}`,
      );
      s.expect(lines.filter((l) => l.includes("PAGED")).length === 1, "PAGED typed once");
    },
  },

  {
    name: "reload: space n r on a note with unsaved changes, the file as it was — asks to discard; n keeps them, autosave still on; y reloads, u brings them back (DF-D6)",
    options: { open: "meetings/2026-09-14-weekly.md", config: "[editor]\nautosave_ms = 6000\n" },
    run: async (s) => {
      const NOTE = "meetings/2026-09-14-weekly.md";
      const before = s.read(NOTE);
      await leader(s, "n", "v");
      await s.keys("G", "o");
      await s.type("kept after n");
      await s.keys("escape");
      await s.status("unsaved");
      await leader(s, "n", "r");
      await s.see("Discard your changes to meetings/2026-09-14-weekly.md?");
      s.expect(s.rowOf("(l) Load theirs") < 0, "not the conflict prompt: the file hasn't changed");
      await s.keys("n");
      await s.notSee("Discard your changes");
      await s.see("kept after n");
      await s.status("unsaved");
      s.expect(
        !s.statusLine().includes("differs from disk"),
        `kept as an edit, not a conflict kept (autosave off):\n${s.statusLine()}`,
      );
      // Autosave was left on: with no key pressed, it writes the text kept.
      await s.file(NOTE, (t) => t.includes("kept after n"), "autosave to write the text kept", 15000);
      await s.message("autosaved");
      // Again, and y: the file as it is on disk; u brings the changes back.
      await s.keys("o");
      await s.type("dropped by y");
      await s.keys("escape");
      await s.status("unsaved");
      await leader(s, "n", "r");
      await s.see("Discard your changes to meetings/2026-09-14-weekly.md?");
      await s.keys("y");
      await s.notSee("dropped by y");
      await s.until(() => !s.statusLine().includes("unsaved"), 3000, "the note as saved");
      await s.see("kept after n");
      s.expect(!s.read(NOTE).includes("dropped by y") && s.read(NOTE) !== before, "the file as autosave left it");
      await s.keys("u");
      await s.see("dropped by y");
    },
  },

  {
    name: "which-key: z, [ and ] list every key under them — the fold and spelling keys under z; ] s, ] t, ] c (A16); each says what it holds in its title (F12)",
    options: { config: "[input]\nwhich_key_delay_ms = 100\n" },
    run: async (s) => {
      /** The popup's entry for `key`: a row with the key, then its name. */
      const entry = (key: string, name: string) =>
        new RegExp(`(^|\\s)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(→\\s+)?${name}`);
      const popup = async (prefix: string, title: string, entries: [string, string][]) => {
        await s.pane.keys(prefix);
        await s.see(title);
        for (const [key, name] of entries) await s.see(entry(key, name));
        await s.keys("escape");
        await s.notSee(title);
      };
      // The title: the keys, the group's name and its explanation, whose start fits any pane (DF-D31).
      await popup("z", "z › scroll: the cursor's line to the middle (z), top (t)", [
        ["z", "Cursor's line to the middle"],
        ["t", "Cursor's line to the top"],
        ["b", "Cursor's line to the bottom"],
        ["=", "Spelling suggestions"],
        ["g", "Add the word to your words"],
        ["a", "Fold or unfold the cell"],
      ]);
      await popup("[", "[ › previous: heading ([), link (l), misspelt word (s)", [
        ["[", "Previous heading"],
        ["l", "Previous link"],
        ["s", "Previous misspelt word"],
        ["c", "Previous change"],
        ["t", "Previous of this type"],
      ]);
      await popup("]", "] › next: heading (]), link (l), misspelt word (s)", [
        ["]", "Next heading"],
        ["l", "Next link"],
        ["s", "Next misspelt word"],
        ["c", "Next change"],
        ["t", "Next of this type"],
      ]);
    },
  },

  {
    name: "links: a picture followed, linked or embedded — its path copied, said so, no later phase promised (A17)",
    options: {
      open: "pic.md",
      files: {
        "pic.md": "# Pictures\n\nThe [shutter drawing](projects/attachments/dome-shutter.png) from the refit.\n",
      },
    },
    run: async (s) => {
      const SAID = "attachment projects/attachments/dome-shutter.png — path copied";
      await follow(s, "shutter drawing");
      await s.message("attachment projects/attachments/dome-shutter.png");
      await s.until(
        () => s.clipboard().endsWith("/vault/projects/attachments/dome-shutter.png"),
        3000,
        "the picture's path copied",
      );
      await opened(s, "pic.md");
      // The message whole: nothing after "path copied" (it promised pictures "in a later phase").
      const said = await lastMessage(s, "attachment");
      s.expect(said === SAID, `the message: ${said}`);
      // Embedded, in the refit's note: the same (the first box gone, so it's the embed's that says it).
      await s.notSee("attachment projects/attachments/dome-shutter.png", 8000);
      await open(s, "dome-refit");
      await follow(s, "dome-shutter.png");
      await s.message("attachment projects/attachments/dome-shutter.png");
      await opened(s, "projects/dome-refit.md");
      const again = await lastMessage(s, "attachment");
      s.expect(again === SAID, `the embed's message: ${again}`);
    },
  },

  {
    name: "trash: two notes deleted, space v t lists them and ends with Empty the trash…; enter, y, gone for good — then space n m into a folder, named or ending in / (DF-D14, DF-D4)",
    options: { files: { "old-a.md": "# Old A\n", "old-b.md": "# Old B\n" } },
    run: async (s) => {
      for (const name of ["old-a", "old-b"]) {
        await open(s, name);
        await leader(s, "n", "d");
        await s.see(`Delete ${name}.md?`);
        await s.type("y");
        await s.message(`deleted ${name}.md`);
        s.expect(!s.exists(`${name}.md`), `${name}.md gone to the trash`);
      }
      // The trash's list: newest first, a blank row, then the last row, which empties it.
      await leader(s, "v", "t");
      await s.see("Trash (2) — enter restores");
      await s.see("Empty the trash…");
      // Each item's row with when it was deleted (not the boxes saying so, which may still show).
      const [b, a, empty] = [
        s.rowOf(/\bold-b\.md +\d{4}-\d\d-\d\d \d\d:\d\d/),
        s.rowOf(/\bold-a\.md +\d{4}-\d\d-\d\d \d\d:\d\d/),
        s.rowOf("Empty the trash…"),
      ];
      s.expect(
        b >= 0 && a > b && empty > a + 1,
        `old-b, old-a, then Empty the trash… last (rows ${b}, ${a}, ${empty})`,
      );
      // up from the first row: the last one; enter asks.
      await s.keys("up", "enter");
      await s.see("Empty the trash? Its 2 items go for good");
      await s.keys("y");
      await s.message("emptied the trash: 2 items gone for good");
      const state = join(s.dir, "state");
      const trash = (readdirSync(state, { recursive: true }) as string[]).find((f) => f.endsWith("trash"));
      s.expect(
        !!trash && readdirSync(join(state, trash)).join(" ") === "trash.json",
        `nothing left in the trash but its list: ${trash && readdirSync(join(state, trash))}`,
      );
      await leader(s, "v", "t");
      await s.message("the trash is empty");
      s.expect(!s.exists("old-a.md") && !s.exists("old-b.md"), "neither note back");
      // space n m with an existing folder's name: into it, the note's own name kept.
      await s.keys("escape");
      await open(s, "kenji-mori");
      await leader(s, "n", "m");
      await s.see("rename or move people/kenji-mori.md to:");
      await s.keys("ctrl+u");
      await s.type("projects");
      await s.keys("enter");
      await s.see(/people\/kenji-mori\.md → projects\/kenji-mori\.md: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.file("projects/kenji-mori.md", (t) => t.includes("# Kenji Mori"), "moved into projects/");
      s.expect(
        !s.exists("projects.md") && !s.exists("people/kenji-mori.md"),
        "no projects.md beside the folder; the old path gone",
      );
      await opened(s, "projects/kenji-mori.md");
      s.expect(s.read("home.md").includes("(projects/kenji-mori.md)"), "home's link follows it");
      // A name ending in /, a folder not there yet: made, the note in it.
      await leader(s, "n", "m");
      await s.see("rename or move projects/kenji-mori.md to:");
      await s.keys("ctrl+u");
      await s.type("visitors/");
      await s.keys("enter");
      await s.see(/projects\/kenji-mori\.md → visitors\/kenji-mori\.md: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.file("visitors/kenji-mori.md", (t) => t.includes("# Kenji Mori"), "moved into the new visitors/");
      await opened(s, "visitors/kenji-mori.md");
    },
  },

  {
    name: "world/links: a clone named its own way — the qualified pointer and the hosting URL open ~/work/kestrel; linked search leaves the worktree out; a missing heading or block opens the note at its top, the hover says so (DF-T5, DF-D26)",
    options: {
      home: true,
      startAt: "home/notes/research/link-styles.md",
      // Both copies of kestrel's repository known here, the spike (a clone, .slipbox/-named engine-spike) found first.
      setup: (s) => {
        s.cliIn("~/notes/research/route-engine-spike", "ls");
        s.cliIn("~/work/kestrel", "ls");
      },
    },
    run: async (s) => {
      // A8: `slipbox://github.com/kestrel-labs/kestrel/docs/architecture.md`: the copy called by the remote's name.
      await follow(s, "qualified.");
      await s.status(/ kestrel[ ·]/);
      await opened(s, "docs/architecture.md");
      s.expect(!/engine-spike/.test(s.statusLine()), `kestrel, not the spike:\n${s.statusLine()}`);
      // A hosting URL to the repository, from product's README: the same copy, at its top.
      await s.restart({ startAt: "home/work/product/README.md" });
      await s.status(/ product[ ·]/);
      await s.keys("/");
      await s.type("code is in");
      await s.keys("enter", "escape", "tab");
      await s.status(/→ https:\/\/github\.com\/kestrel-labs\/kestrel\b/);
      await s.keys("enter");
      await s.status(/ kestrel[ ·]/);
      await opened(s, "README.md");
      s.expect(!/engine-spike/.test(s.statusLine()), `kestrel, not the spike:\n${s.statusLine()}`);
      // B1: search from notes, widened to the linked folders: kestrel's hits, none of the agent's worktree, though
      // link-styles.md points into it by `@agent/sync-retry` (its runbook says "parks at once").
      await s.restart({ startAt: "home/notes/index.md" });
      await leader(s, "f", "s");
      await s.type("parks");
      await s.see(/"parks" — \d+ files?/, 15000); // once notes/ is indexed
      await s.keys("ctrl+a");
      await s.see("and the folders linked to it");
      await s.see("~/work/kestrel/docs/sync.md");
      s.expect(!worktreeRows(s).length, `no hit from the worktree:\n${worktreeRows(s).join("\n")}`);
      await s.keys("escape");
      // B2: the PRD read far down, then links to a heading and a block it hasn't: each opens it at its top, said so.
      // F7 (DF-D26): the hover on such a link says where following it lands.
      await s.restart({ startAt: "home/notes/meetings/2026-09-05-feedback-synthesis.md" });
      await s.keys("/");
      await s.type("the pricing section");
      await s.keys("enter", "escape", "shift+k");
      await s.see('No heading "pricing" in', 5000);
      await s.see("its top."); // the sentence ends so, wrapped in the hover however wide it is
      await s.keys("escape");
      await s.restart({ startAt: "home/work/product/prd/route-sharing.md" });
      await moveTo(s, ["shift+g"], (l) => l > 50, "the PRD's end");
      for (const [link, said] of [
        ["the pricing section", 'no heading "pricing" in'],
        ["in the third paragraph", "no block ^trim-decision in"],
      ] as const) {
        await s.restart({ startAt: "home/notes/meetings/2026-09-05-feedback-synthesis.md" });
        await follow(s, link);
        await opened(s, "prd/route-sharing.md");
        await s.status(/ product[ ·]/);
        await s.status(/L1:/);
        await s.message(said);
        s.expect(
          (await lastMessage(s, said)).endsWith("prd/route-sharing.md: opened at its top"),
          `${said} …: opened at its top`,
        );
        // Far down again, for the next link: only its top can say it landed there.
        await moveTo(s, ["shift+g"], (l) => l > 50, "the PRD's end again");
      }
    },
  },

  {
    name: "world/code: the code view — enter on a path in a comment's prose; slipbox's own syntax error on its cell, no server; Obsidian's ==highlight== and %%comment%% (DF-T7)",
    options: {
      home: true,
      startAt: "home/work/kestrel/src/sync/queue.ts",
      beside: {
        "home/work/kestrel/src/sync/broken.ts":
          "export function total(a: number) {\n  return a +;\n}\n\nexport const fine = 1;\n",
      },
    },
    run: async (s) => {
      // The code view (READ, not SOURCE): the first comment is prose, its `../../docs/sync.md` a link enter follows.
      await s.status(/READ/);
      await opened(s, "src/sync/queue.ts");
      await follow(s, "../../docs/sync.md");
      await opened(s, "docs/sync.md");
      await s.status(/ kestrel[ ·]/);
      // A syntax error slipbox finds itself (no language server running): counted, and on its cell's header.
      await s.restart({ startAt: "home/work/kestrel/src/sync/broken.ts" });
      await s.status(/READ/);
      await s.status(signed("{error} 1"), 8000);
      // Its sign among the cell header's buttons (a count beside it only from two); the other cell's header has none.
      await s.until(
        () => s.screen().some((r) => r.includes("function: total") && signed("{error}").test(r)),
        5000,
        "the function's cell header with the error's sign",
      );
      const fine = s.screen().find((r) => /[┌─] .*\bfine\b/.test(r)) ?? "";
      s.expect(
        !!fine && !signed("{error}|{warning}").test(fine),
        `the fine cell's header with no problem's sign: ${fine}`,
      );
      // Obsidian's: a comment hidden while reading, a highlight in a colour of its own; both as typed in source mode.
      await s.restart({ startAt: "home/hobbies/cooking/Pantry.md" });
      await s.see("the good olive oil.");
      await s.notSee("Cretan tin");
      await s.notSee("==bold yellow==");
      await s.see("1 cup == 2 cups of water"); // a lone == pair with spaces is text
      const [marked, plain] = [s.styleOf("bold yellow"), s.styleOf("Running low")];
      s.expect(
        !!marked && !!plain && (marked.bg !== plain.bg || marked.fg !== plain.fg),
        `the highlight drawn apart: ${JSON.stringify([marked, plain])}`,
      );
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.see("%%the Cretan tin, not the bottle%%");
      await s.see("==bold yellow==");
      // A comment over blank lines, a list in it: gone while reading, the text around it kept.
      await s.restart({ startAt: "home/hobbies/cooking/Recipes/Family/Grandma's flan.md" });
      await s.see("never wrote it down");
      await s.notSee("Check the amounts with Mum");
      await s.notSee("and on birthdays");
      await s.notSee("Still to ask Mum");
      await s.notSee("goat's milk");
    },
  },

  {
    name: "privacy: a root's .slipbox/config.toml sets render.images_remote = show and update.check — each warned of and ignored; its web picture not fetched, asked about (DF-D1, DF-D23)",
    options: {
      open: "web.md",
      files: { "web.md": "# A web picture\n\nFrom the car park: ![the dome at dusk](http://127.0.0.1:9/x.png)\n" },
      // Halden's own .slipbox/config.toml, with a key only your own config may set.
      setup: (s) =>
        appendFileSync(
          join(s.vault, ".slipbox", "config.toml"),
          '\n[render]\nimages_remote = "show"\n\n[update]\ncheck = true\n',
        ),
    },
    run: async (s) => {
      // The warning, among the messages.
      const warning = `config: ${s.vault}/.slipbox/config.toml sets render.images_remote, which only your own config may set (what reaches the network is yours to allow); ignored`;
      const said = await lastMessage(s, "images_remote");
      s.expect(said === warning, `the warning, whole:\n${said}`);
      // DF-D23: the folder's update.check too, said the same way.
      const check = await lastMessage(s, "update.check");
      s.expect(
        check === warning.replace("render.images_remote", "update.check"),
        `update.check's warning, whole:\n${check}`,
      );
      // The folder's "show" ignored: your own (the default, ask) stands — followed, it asks; n, nothing fetched.
      await follow(s, "the dome at dusk");
      await s.see("Fetch this picture from http://127.0.0.1:9?");
      s.expect(s.rowOf("fetching http://127.0.0.1:9/x.png") < 0, "not fetched at once, as show would");
      await s.keys("n");
      await s.notSee("Fetch this picture from");
      await s.see("the dome at dusk");
      s.expect(s.rowOf("fetching") < 0, "nothing fetched after n");
      s.expect(
        !existsSync(join(s.dir, "cache", "slipbox", "images")) ||
          !readdirSync(join(s.dir, "cache", "slipbox", "images")).length,
        "no picture in the cache",
      );
    },
  },

  {
    name: "export: the Save As window — a name ending in / that isn't there makes that folder and goes into it, the note's name given back; enter exports there (DF-D5)",
    options: HOME,
    run: async (s) => {
      await leader(s, "n", "o");
      await s.see("Export home.md as");
      await s.type("word");
      await s.keys("enter");
      await s.see("Name: home.docx");
      await s.keys("ctrl+u");
      await s.type("made/v1/");
      await s.see("Name: made/v1/");
      await s.keys("enter");
      await s.see("Name: home.docx");
      await s.see(/[│┃] made\/v1\/ +[│┃]/); // the window's folder, from the note's
      await s.see("an empty folder");
      s.expect(existsSync(s.path("made/v1")), "made/v1/ made");
      s.expect(!s.exists("made/v1/home.docx") && !s.exists("made/v1.docx"), "nothing exported yet");
      await s.keys("enter");
      await exported(s, "made/v1/home.docx", "PK\x03\x04");
      await s.message("exported home.md");
    },
  },
];
