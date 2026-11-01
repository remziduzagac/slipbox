// Symlink choices, remembered answers, access, watching and links renamed or moved.

import { chmodSync, existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Check, explorerOpen, explorerRow, inSwitcher, leader, opened } from "../check.ts";
import { Skipped, sleep } from "../session.ts";
import { lastMessage, toLink } from "../support/links.ts";
import { asked, markOf, rowEnd, shelf, symlinkOnce, WIDE } from "../support/vaults.ts";

// --- links ------------------------------------------------------------------------------------------------------

export const LINKED: Check[] = [
  {
    area: "links-and-files",
    name: "links: a symlink out of the vault asks first — n not followed, l just looks (read-only, nothing indexed), f follows it, kept",
    covers: { cases: ["links/state", "links/travel", "safety"], commands: ["link.follow", "backlinks.open"] },
    options: { home: true, startAt: "home/notes/to-shelf.md", config: WIDE, setup: shelf },
    run: async (s) => {
      // Opened through the link: asked, saying what a yes allows in a vault.
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.see("read and indexed as notes's, never written to: it's outside the vault");
      await s.see("Just look");
      // n: not followed — nothing opened; the explorer's row says where it leads, and that it isn't followed.
      await s.keys("n");
      await s.notSee(asked("~/shelf"));
      await opened(s, "to-shelf.md");
      await explorerOpen(s);
      await s.keys("escape");
      await s.until(
        () => rowEnd(s, "shelf")?.describe === "→ ~/shelf  not followed" && markOf(s, "shelf") === "⊘",
        3000,
        "the link's row: → ~/shelf  not followed, ⊘",
      );
      // Asked again; l: just looked at — read-only, nothing of it indexed.
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("l");
      await opened(s, "shelf/far.md");
      await s.see("A note kept on the shelf.");
      await s.keys("i");
      const refused = await lastMessage(s, "not editing");
      s.expect(
        refused === "just looking: ~/notes/shelf isn't followed — read-only — not editing",
        `typing refused: ${refused}`,
      );
      await leader(s, "l", "b");
      await s.message("backlinks are kept for the notes of a vault");
      await s.until(() => rowEnd(s, "shelf")?.describe === "→ ~/shelf  just looking", 3000, "the row: just looking");
      // Looking is for this once: started again, asked again; f: followed — read and indexed, its backlink found.
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      await s.restart();
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await opened(s, "shelf/far.md");
      // Followed: the target asked, then the vault walked again through the link and its notes parsed, in the
      // background — the row says so once they're done, indexed.
      await explorerOpen(s);
      await s.keys("escape");
      await s.until(
        () => rowEnd(s, "shelf")?.describe === "→ ~/shelf" && markOf(s, "shelf") === "●",
        20_000,
        "the row: → ~/shelf, followed and indexed ●",
      );
      // Its backlink found: asked until the list shows it (a press while the index catches up says none yet).
      await s.retry(
        async () => {
          if (s.rowOf("Linking to") >= 0) await s.keys("escape");
          await leader(s, "l", "b");
        },
        () => s.rowOf("Linking to far.md (1)") >= 0,
        "far.md's backlink, from to-shelf.md",
        2000,
        20_000,
      );
      await s.keys("escape");
      // Kept: started again, the link opens, nothing asked.
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      await s.restart();
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await opened(s, "shelf/far.md");
      s.expect(!s.text().includes("follow it?"), "followed once: never asked again");
    },
  },
  {
    area: "links-and-files",
    name: "links: a note just looked at through a link, the link followed later — the same window the vault's note, writable",
    covers: { cases: ["links/state", "links/backlinks"], commands: ["link.follow", "vault.links", "backlinks.open"] },
    options: { home: true, startAt: "home/notes/to-shelf.md", setup: shelf },
    run: async (s) => {
      // l: just looked at — read-only.
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("l");
      await opened(s, "shelf/far.md");
      await s.keys("i");
      // Read whole from the list: a long path wraps its box.
      s.expect((await lastMessage(s, "not editing")).endsWith("— not editing"), "i refused: read-only");
      // Forgotten, then followed: asked again, f.
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await opened(s, "shelf/far.md");
      // Once the vault is walked through the link, the window open on it is the vault's note: its backlink found,
      // and it takes typing.
      await s.retry(
        async () => {
          if (s.rowOf("Linking to") >= 0) await s.keys("escape");
          await leader(s, "l", "b");
        },
        () => s.rowOf("Linking to far.md (1)") >= 0,
        "far.md's backlink, from to-shelf.md",
        2000,
        20_000,
      );
      await s.keys("escape");
      await s.keys("i");
      await s.until(
        () => /^(?: SOURCE │ INSERT| READ·LENS │ (?:NORMAL|INSERT))\b/.test(s.statusLine()),
        3000,
        "i to edit: writable now",
      );
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "links: a link followed, its note open, forgotten — read-only, an edit out there unread; followed again, read and writable",
    covers: { cases: ["links/state", "safety", "watching"], commands: ["link.follow", "vault.links"] },
    options: { home: true, startAt: "home/notes/to-shelf.md", setup: shelf },
    run: async (s) => {
      // f: followed, the note open through the link.
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await opened(s, "shelf/far.md");
      await s.see("A note kept on the shelf.");
      // Forgotten: the window read-only, and what's written out there isn't read through the link.
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      await s.keys("i");
      // Read whole from the list: a long path wraps its box.
      s.expect((await lastMessage(s, "not editing")).endsWith("— not editing"), "i refused: read-only");
      s.write("~/shelf/far.md", "# Far\n\nRewritten on the shelf.\n");
      await sleep(2500);
      await s.notSee("Rewritten on the shelf.");
      // Followed again: asked, f; the same window read again, and it takes typing.
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await opened(s, "shelf/far.md");
      await s.see("Rewritten on the shelf.", 10_000);
      await s.keys("i");
      await s.until(
        () => /^(?: SOURCE │ INSERT| READ·LENS │ (?:NORMAL|INSERT))\b/.test(s.statusLine()),
        3000,
        "i to edit: writable again",
      );
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "links: a note too big to index, looked at through a link, then followed — still read-only: a vault never writes out of itself",
    covers: { cases: ["links/state", "safety"], commands: ["link.follow", "vault.links"] },
    options: {
      home: true,
      startAt: "home/notes/to-big.md",
      config: "[walk]\nmax_file_size = 300\n",
      setup: (s) => {
        if (!s.exists("~/shelf/big.md"))
          s.write("~/shelf/big.md", `# Big\n\n${"A long line of a note too big to index. ".repeat(12)}\n`);
        if (!s.exists("~/notes/to-big.md"))
          s.write("~/notes/to-big.md", "# To the big one\n\n[The big note](shelf/big.md).\n");
        symlinkOnce(s.path("~/shelf"), s.path("~/notes/shelf"));
      },
    },
    run: async (s) => {
      await toLink(s, "shelf/big.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("l");
      await opened(s, "shelf/big.md");
      // Forgotten, opened again, followed: the vault doesn't take a note past its size cap, so the window stays
      // read-only — a write would land outside the vault.
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      await s.keys("ctrl+o");
      await opened(s, "to-big.md");
      await toLink(s, "shelf/big.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await s.message("following", 5000);
      await opened(s, "shelf/big.md");
      await s.keys("i");
      // Read whole from the list: a long path wraps its box.
      s.expect((await lastMessage(s, "not editing")).endsWith("— not editing"), "i refused: read-only");
    },
  },
  {
    area: "links-and-files",
    name: "links: a note too big to index, through a link followed, typed into and saved — never written: a vault never writes out of itself",
    covers: { cases: ["links/state", "safety"], commands: ["link.follow"] },
    // Fails at random on CI's Linux runners. Job 120896065125, 3.3 s in: `:w` refused, but the Messages list looked up
    // after it never opened, the needle typed into the report window instead (the last commands run `palette.open,
    // note.save, help.report`). Job 120903950535, 33 s in: slipbox not exiting cleanly.
    quarantined: "#73",
    options: {
      home: true,
      startAt: "home/notes/to-big.md",
      config: "[walk]\nmax_file_size = 300\n",
      setup: (s) => {
        if (!s.exists("~/shelf/big.md"))
          s.write("~/shelf/big.md", `# Big\n\n${"A long line of a note too big to index. ".repeat(12)}\n`);
        if (!s.exists("~/notes/to-big.md"))
          s.write("~/notes/to-big.md", "# To the big one\n\n[The big note](shelf/big.md).\n");
        symlinkOnce(s.path("~/shelf"), s.path("~/notes/shelf"));
      },
    },
    run: async (s) => {
      const before = s.read("~/shelf/big.md");
      await toLink(s, "shelf/big.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await s.message("following", 5000);
      await opened(s, "shelf/big.md");
      // Opened through the link followed, the vault not taking it: typed into, saved — refused, as a note the vault
      // takes through a link is.
      // Typed on a new line at its end: the lens, then typing in it.
      await s.keys("G", "o");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.type("Typed here.");
      await s.keys("escape");
      await s.ex("w");
      s.expect((await lastMessage(s, "resolves outside")).includes("resolves outside the vault"), ":w refused");
      s.expect(s.read("~/shelf/big.md") === before, "nothing written out of the vault");
    },
  },
  {
    area: "links-and-files",
    name: "links: a note looked at through a link, its task toggled; followed, typed into, the link forgotten, saved — nothing written through the link",
    covers: { cases: ["links/state", "safety"], commands: ["link.follow", "vault.links", "task.toggle"] },
    options: {
      home: true,
      startAt: "home/notes/to-tasks.md",
      // Autosave soon after the last key: it would ask about a change out there, reading it through the link.
      config: "[editor]\nautosave_ms = 1000\n",
      setup: (s) => {
        if (!s.exists("~/shelf/tasks.md")) s.write("~/shelf/tasks.md", "# Tasks\n\n- [ ] Shelve it.\n");
        if (!s.exists("~/notes/to-tasks.md"))
          s.write("~/notes/to-tasks.md", "# To the tasks\n\n[The tasks](shelf/tasks.md).\n");
        symlinkOnce(s.path("~/shelf"), s.path("~/notes/shelf"));
      },
    },
    run: async (s) => {
      const kept = "# Tasks\n\n- [ ] Shelve it.\n";
      const forget = async () => {
        await s.ex("symlinks");
        await s.see("Symlinks you've answered");
        await s.keys("enter");
        await s.message("forgot", 5000);
      };
      // l: just looked at; its task toggled — written nowhere, the link not followed.
      await toLink(s, "shelf/tasks.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("l");
      await opened(s, "shelf/tasks.md");
      await s.keys("shift+g");
      await s.keys("ctrl+l");
      s.expect((await lastMessage(s, "not toggled")).includes("tasks.md: not toggled"), "the toggle refused");
      s.expect(s.read("~/shelf/tasks.md") === kept, "the task not toggled through the link");
      // Followed, typed into, then forgotten: what's typed isn't written through the link, :w or not.
      await forget();
      await s.keys("ctrl+o");
      await opened(s, "to-tasks.md");
      await toLink(s, "shelf/tasks.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await opened(s, "shelf/tasks.md");
      // Typed on a new line at its end: the lens, then typing in it.
      await s.keys("G", "o");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.type("Typed here.");
      await s.keys("escape");
      await forget();
      // Changed out there, its task toggled here: nothing read through the link forgotten, nothing toggled.
      s.write("~/shelf/tasks.md", "# Tasks\n\n- [ ] Shelve it.\n- [ ] Changed out there.\n");
      await sleep(2500);
      s.expect(!s.screen().some((r) => r.includes("you have unsaved changes")), "no conflict asked: theirs not read");
      await s.keys("k");
      await s.keys("ctrl+l");
      s.expect((await lastMessage(s, "not toggled")).includes("tasks.md: not toggled"), "the toggle refused");
      await s.notSee("Changed out there.");
      await s.ex("w");
      s.expect((await lastMessage(s, "not written")).includes("tasks.md not written"), ":w refused");
      s.expect(!s.read("~/shelf/tasks.md").includes("Typed here."), "nothing typed written through the link forgotten");
    },
  },
  {
    area: "links-and-files",
    name: "links: a note looked at through a link, followed, its target not answering — not followed for now, still read-only",
    covers: { cases: ["links/state", "safety"], commands: ["link.follow", "vault.links"] },
    options: { home: true, startAt: "home/notes/to-shelf.md", setup: shelf },
    run: async (s) => {
      if (process.getuid?.() === 0)
        throw new Skipped("root lists any folder: a target that won't is only so for others");
      // On macOS one you may not list has no real path either (Bun opens it to find it): the link leads nowhere.
      if (process.platform === "darwin")
        throw new Skipped("on macOS a folder you may not list leads nowhere: nothing to follow, the unit test's case");
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("l");
      await opened(s, "shelf/far.md");
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      // The shelf lists nothing now (its files still read and written): asked, it doesn't answer.
      chmodSync(s.path("~/shelf"), 0o300);
      try {
        await toLink(s, "shelf/far.md");
        await s.keys("enter");
        await s.see(asked("~/shelf"));
        await s.keys("f");
        await sleep(4500);
        s.expect((await lastMessage(s, "didn't answer")).endsWith("not followed for now"), "not followed for now");
        // The polls meanwhile lift nothing: opened again, it's read-only as it was.
        await sleep(2500);
        await s.ex(`e ${s.path("~/notes/shelf/far.md")}`);
        await opened(s, "shelf/far.md");
        await s.keys("i");
        s.expect((await lastMessage(s, "not editing")).endsWith("— not editing"), "i refused: still read-only");
      } finally {
        chmodSync(s.path("~/shelf"), 0o755);
      }
    },
  },
  {
    area: "links-and-files",
    name: "links: a note looked at through a file link, the link made a note of the vault's own — indexed, and its window takes typing",
    covers: { cases: ["links/state", "watching"], commands: ["note.open"] },
    options: {
      home: true,
      startAt: "home/notes/to-shelf.md",
      setup: (s) => {
        shelf(s);
        symlinkOnce(s.path("~/shelf/far.md"), s.path("~/notes/far-link.md"));
      },
    },
    run: async (s) => {
      await s.ex("e far-link.md");
      await s.see(/follow it\?/, 5000);
      await s.keys("l");
      await opened(s, "far-link.md");
      await s.see("A note kept on the shelf.");
      // The link replaced by a note of the vault's own, as an editor or git would.
      rmSync(s.path("~/notes/far-link.md"));
      s.write("~/notes/far-link.md", "# Far link\n\nThe vault's own now.\n");
      await s.see("The vault's own now.", 5000);
      await inSwitcher(s, "far-link", "far-link.md");
      await s.keys("escape");
      await s.keys("G", "o");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "links: a followed link pointed elsewhere asks again — its answer was for where it led",
    covers: { cases: ["links/state", "safety"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/to-shelf.md",
      setup: (s) => {
        if (s.exists("~/notes/to-shelf.md")) return;
        s.write("~/shelf-a/far.md", "# Far\n\nOn shelf A.\n");
        s.write("~/shelf-b/far.md", "# Far\n\nOn shelf B.\n");
        s.write("~/notes/to-shelf.md", "# To the shelf\n\nWhat's kept on [the shelf](shelf/far.md).\n");
        symlinkOnce(s.path("~/shelf-a"), s.path("~/notes/shelf"));
        // Followed to shelf-a, as the question's f keeps it: by the link, and where it led.
        mkdirSync(join(s.dir, "state", "slipbox"), { recursive: true });
        writeFileSync(
          join(s.dir, "state", "slipbox", "links.json"),
          JSON.stringify({
            version: 1,
            links: [{ link: s.path("~/notes/shelf"), target: s.path("~/shelf-a"), answer: "follow", at: "2026-10-16" }],
          }),
        );
      },
    },
    run: async (s) => {
      // Followed: opened, nothing asked.
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await opened(s, "shelf/far.md");
      await s.see("On shelf A.");
      s.expect(!s.text().includes("follow it?"), "followed: nothing asked");
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      // Pointed elsewhere (a pull, an agent): asked again, naming where it leads now; nothing read through it.
      rmSync(s.path("~/notes/shelf"));
      symlinkSync(s.path("~/shelf-b"), s.path("~/notes/shelf"));
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf-b"));
      s.expect(!s.text().includes("On shelf B."), "nothing read through it before the answer");
      await s.keys("n");
      await opened(s, "to-shelf.md");
    },
  },
  {
    area: "links-and-files",
    name: "links: a followed link renamed with r, a relative one moved with m — each moves as a link, still followed, what it leads to where it was; undone, back",
    covers: { cases: ["links/state", "rename", "safety"], commands: ["rename.undo"] },
    options: {
      home: true,
      startAt: "home/notes/to-shelf.md",
      config: WIDE,
      setup: (s) => {
        if (!s.exists("~/notes/to-shelf.md")) {
          s.write("~/shelf/far.md", "# Far\n\nA note kept on the shelf.\n");
          s.write("~/attic/old.md", "# Old\n\nUp in the attic.\n");
          s.write("~/notes/box/kept.md", "# Kept\n");
          s.write("~/notes/to-shelf.md", "# To the shelf\n\nWhat's kept on [the shelf](shelf/far.md).\n");
        }
        symlinkOnce(s.path("~/shelf"), s.path("~/notes/shelf"));
        symlinkOnce("../attic", s.path("~/notes/attic")); // relative
        // Both followed, as the question's f keeps them: by the link, and where it leads.
        mkdirSync(join(s.dir, "state", "slipbox"), { recursive: true });
        const follow = (link: string, target: string) => ({ link, target, answer: "follow", at: "2026-10-23" });
        writeFileSync(
          join(s.dir, "state", "slipbox", "links.json"),
          JSON.stringify({
            version: 1,
            links: [
              follow(s.path("~/notes/shelf"), s.path("~/shelf")),
              follow(s.path("~/notes/attic"), s.path("~/attic")),
            ],
          }),
        );
      },
    },
    run: async (s) => {
      // r on the link's row: the link itself renamed, the note linking through it following.
      await explorerOpen(s);
      await explorerRow(s, "shelf");
      await s.keys("r");
      await s.see("rename shelf/ to:");
      await s.keys("ctrl+u");
      await s.type("shelved");
      await s.keys("enter");
      await s.see("shelf/ → shelved/: 1 change in 1 file");
      await s.keys("enter");
      await s.message("moved shelf/ → shelved/");
      s.expect(lstatSync(s.path("~/notes/shelved")).isSymbolicLink(), "the link renamed, a link still");
      s.expect(s.exists("~/shelf/far.md") && !s.exists("~/notes/shelf"), "what it leads to where it was");
      s.expect(s.read("~/notes/to-shelf.md").includes("(shelved/far.md)"), "the link to it follows");
      // Still followed, and indexed: its row says where it leads, nothing asked going through it.
      await s.keys("escape");
      await s.until(
        () => rowEnd(s, "shelved")?.describe === "→ ~/shelf" && markOf(s, "shelved") === "●",
        20_000,
        "the row: → ~/shelf, followed and indexed ●",
      );
      await toLink(s, "shelved/far.md");
      await s.keys("enter");
      await opened(s, "shelved/far.md");
      await s.see("A note kept on the shelf.");
      s.expect(!s.text().includes("follow it?"), "renamed, still followed: nothing asked");
      // Watched through its new name: changed from outside, it's read again.
      writeFileSync(s.path("~/shelf/far.md"), "# Far\n\nMoved along the shelf.\n");
      await s.see("Moved along the shelf.", 10_000);
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      // m on the relative one: into box, written again to lead where it did, and said so.
      await explorerOpen(s);
      await explorerRow(s, "attic");
      await s.keys("m");
      await s.see("Move attic/ to…");
      await s.type("box");
      await s.keys("enter");
      await s.see("attic is a relative link: written again at box/attic to lead where it did (../../attic)");
      await s.keys("enter");
      await s.message("moved attic/ → box/attic/");
      s.expect(readlinkSync(s.path("~/notes/box/attic")) === "../../attic", "written again from box");
      await s.keys("escape");
      await s.until(() => markOf(s, "attic") === "●", 20_000, "box/attic followed and indexed ●");
      // Undone, newest first: each link back where it was, as it was written.
      for (const [from, to] of [
        ["box/attic", "attic"],
        ["shelved", "shelf"],
      ]) {
        await leader(s, "v", "shift+u");
        await s.see(`undo: ${from}/ → ${to}/`);
        // The relative one written again as it moves back, and said.
        if (from === "box/attic") await s.see("box/attic is a relative link: written again at attic");
        await s.keys("enter");
        await s.message(`moved ${from}/ back to`); // the toast wraps the rest
      }
      s.expect(readlinkSync(s.path("~/notes/attic")) === "../attic", "the relative link as it was written");
      s.expect(lstatSync(s.path("~/notes/shelf")).isSymbolicLink(), "the renamed link back");
      s.expect(s.read("~/notes/to-shelf.md").includes("(shelf/far.md)"), "the note linking to it as it was");
    },
  },
  {
    area: "links-and-files",
    name: "links: a symlink within the vault never asks — a note's second name opened; a folder's, the folder it names",
    covers: { cases: ["links/state", "links/travel"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/to-kept.md",
      config: WIDE,
      setup: (s) => {
        if (!s.exists("~/notes/to-kept.md")) {
          s.write("~/notes/.shelved/kept.md", "# Kept\n\nShelved, and still the vault's.\n");
          s.write("~/notes/to-kept.md", "# To what's kept\n\nWhat's [kept](kept.md).\n");
        }
        symlinkOnce(".shelved/kept.md", s.path("~/notes/kept.md"));
        symlinkOnce("projects", s.path("~/notes/again"));
      },
    },
    run: async (s) => {
      // A note's link, its target inside the vault: opened, nothing asked.
      await toLink(s, "kept.md");
      await s.keys("enter");
      await opened(s, "kept.md");
      await s.see("Shelved, and still the vault's.");
      s.expect(!s.text().includes("follow it?"), "a link within the vault: nothing asked");
      // A folder's: its row says where it leads, never "not followed"; opened, the folder it names.
      await explorerOpen(s);
      await s.keys("escape");
      await s.until(
        () => rowEnd(s, "again")?.describe === "→ ~/notes/projects",
        3000,
        "again's row: → ~/notes/projects",
      );
      await explorerOpen(s);
      await explorerRow(s, "again");
      await s.keys("enter");
      await s.message("again is a second name for projects");
      s.expect(!s.text().includes("follow it?"), "a folder's second name: nothing asked");
    },
  },
  {
    area: "links-and-files",
    name: "links: in Elsewhere every link asks, even one beside its target — what a yes allows there, the file system's say",
    covers: { cases: ["links/state", "vault"] },
    options: {
      startAt: "loose",
      setup: (s) => {
        const loose = join(s.dir, "loose");
        if (existsSync(loose)) return;
        mkdirSync(loose);
        writeFileSync(join(loose, "a.md"), "# A\n\nThe note itself.\n");
        symlinkSync("a.md", join(loose, "b.md"));
      },
    },
    run: async (s) => {
      await s.where("Elsewhere");
      // The file itself: opened, nothing asked.
      await explorerOpen(s);
      await explorerRow(s, "a\\.md");
      await s.keys("enter");
      await s.where("Elsewhere", /a\.md/);
      s.expect(!s.text().includes("Just look"), "a file, no link: nothing asked");
      // Its link beside it: asked — outside home, so agents are said to see what's followed (a heading, in capitals).
      await explorerOpen(s);
      await explorerRow(s, "b\\.md");
      await s.keys("enter");
      await s.see(/b\.md → /);
      await s.see(/a\.md is outside your home folder/i);
      await s.see("read and written as the file system allows");
      await s.see("Just look");
      await s.keys("f");
      await s.where("Elsewhere", /b\.md/, 5000);
      await s.see("The note itself.");
    },
  },
];
