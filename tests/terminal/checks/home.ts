// Vaults, home and Elsewhere, the explorer's view and its rows' marks, links followed only when you say so, the peek
// and the git panel following the vault (VV): the features the workstream built and its review's fixes changed, a
// check each, on the reference set or a fixture each check builds in its own folder.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type Check, explorerOpen, explorerRow, inSwitcher, leader, open, opened } from "../check.ts";
import { CheckFailed, Skipped, sleep } from "../session.ts";
import { crumbs, lastMessage, listed, messagesSaying } from "../support/links.ts";
import {
  git,
  homeFolders,
  homeWalked,
  markOf,
  quits,
  restampOf,
  shell,
  stampOf,
  switcherShows,
  symlinkOnce,
  tab,
  UNWALKED,
  walkJson,
} from "../support/vaults.ts";

// --- home -------------------------------------------------------------------------------------------------------

export const HOME: Check[] = [
  {
    area: "links-and-files",
    name: "home: a folder of home opened by name — its notes there at once, home never walked; its own note open, not home's",
    covers: { cases: ["vault", "opening", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home/household", config: UNWALKED, setup: homeFolders },
    run: async (s) => {
      // Its own note: the one directly in it, before the one a folder down that comes first by path; never home's own
      // README.md, at its top. The top bar names the folder after home: its workspace (WSP-D4).
      await s.where("household", /household\/bike-insurance\.md/);
      await s.see("Bike insurance");
      // The view at the folder opened, home above it.
      await explorerOpen(s);
      await s.until(() => /^~ › household ›$/.test(crumbs(s)), 3000, "the breadcrumb: ~ › household ›");
      await s.keys("escape");
      // Its notes, a folder down too, known at once — and only its: another folder of home isn't walked.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("garden");
      s.expect(s.rowOf("garden/plan.md") < 0, "another folder of home never walked: garden's notes not in the list");
      await s.keys("escape");
      await open(s, "2025-policy");
      await opened(s, "household/archive/2025-policy.md");
      await s.see("The one the renewal replaces.");
    },
  },
  {
    area: "links-and-files",
    name: "home: a folder of home gone into from the explorer — a note of it opened from a vault: into home, the folder's notes there at once",
    covers: { cases: ["vault", "explorer", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home/notes/index.md", config: UNWALKED, setup: homeFolders },
    run: async (s) => {
      await s.where(/^notes(?: │|$)/, /index\.md/);
      await explorerOpen(s);
      await s.until(() => /^~ › \S+ notes ›$/.test(crumbs(s)), 3000, "the view at notes");
      // -: the view at ~, home's folders listed a level at a time; household unfolded in place.
      await s.keys("-");
      await s.until(() => /^~ ›/.test(crumbs(s)) && listed(s, /\shousehold$/), 3000, "the view at ~");
      await explorerRow(s, "household");
      await s.keys("l");
      await s.until(() => listed(s, /\sbike-insurance\.md$/), 3000, "household unfolded");
      // Its note opened: into home (VV-D4), the note open there.
      await explorerRow(s, "bike-insurance\\.md");
      await s.keys("enter");
      await s.where("~", /household\/bike-insurance\.md/, 5000); // a note of it opened: home's own
      // household walked as it was gone into: its note a folder down known, home's walk still to make.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("2025-policy");
      await s.see("household/archive/2025-policy.md");
      await s.keys("escape");
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("garden");
      s.expect(s.rowOf("garden/plan.md") < 0, "another folder of home never walked: garden's notes not in the list");
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "home: each folder of home opened by name keeps its own tabs — two folders in turn, each brought back as left; home's top its own",
    covers: { cases: ["vault", "tabs"], commands: ["tab.new", "switcher.open", "app.quit"] },
    options: { home: true, startAt: "home/household", config: UNWALKED, setup: homeFolders },
    run: async (s) => {
      // household: its note, and a second tab; the top bar names its workspace (WSP-D4).
      await s.where("household", /household\/bike-insurance\.md/);
      await s.keys("ctrl+t", "c");
      await s.see(tab(2, "bike-insurance.md"));
      await open(s, "2025-policy");
      await s.see(tab(2, "2025-policy.md"));
      await quits(s);
      // garden: its own note alone, none of household's tabs.
      await s.restart({ startAt: "home/garden" });
      await s.where("garden", /garden\/plan\.md/);
      s.expect(!/bike-insurance|2025-policy/.test(s.text()), "garden opened on its own note, not household's tabs");
      await s.keys("ctrl+t", "c");
      await s.see(tab(2, "plan.md"));
      await open(s, "seeds");
      await s.see(tab(2, "seeds.md"));
      await quits(s);
      // Each brought back as it was left.
      await s.restart({ startAt: "home/household" });
      await s.see(tab(1, "bike-insurance.md"));
      await s.see(tab(2, "2025-policy.md"));
      s.expect(!/seeds\.md|plan\.md/.test(s.text()), "household's tabs alone");
      await quits(s);
      await s.restart({ startAt: "home/garden" });
      await s.see(tab(1, "plan.md"));
      await s.see(tab(2, "seeds.md"));
      s.expect(!/bike-insurance|2025-policy/.test(s.text()), "garden's tabs alone");
      await quits(s);
      // Home's top: its own, neither folder's.
      await s.restart({ startAt: "home" });
      await s.where("~");
      s.expect(
        ![tab("\\d", "2025-policy.md"), tab("\\d", "seeds.md"), tab("\\d", "plan.md")].some((t) => t.test(s.text())),
        "home's top: none of its folders' tabs",
      );
    },
  },
  {
    area: "links-and-files",
    name: "home: its tabs brought back — one in a folder home's walk hasn't reached has its folder's notes at once, its backlinks there",
    covers: {
      cases: ["vault", "tabs", "switcher", "links/backlinks"],
      commands: ["switcher.open", "backlinks.open", "app.quit"],
    },
    options: { home: true, startAt: "home/household/bike-insurance.md", config: UNWALKED, setup: homeFolders },
    run: async (s) => {
      // A note of household opened by its path, left open: home's top keeps it as its tab.
      await opened(s, "household/bike-insurance.md");
      await quits(s);
      // Home's top: the tab back, its folder walked as it opens — a note a folder down known, never opened.
      await s.restart({ startAt: "home" });
      await s.see(tab(1, "bike-insurance.md"));
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("2025-policy");
      await s.see("household/archive/2025-policy.md");
      await s.keys("escape");
      // What was asked for alone: another folder of home isn't walked.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("garden");
      s.expect(s.rowOf("garden/plan.md") < 0, "another folder of home never walked: garden's notes not in the list");
      await s.keys("escape");
      // Watched as it's walked: a note made in it now comes in.
      s.write("~/household/new-quote.md", "# New quote\n\nA third insurer's.\n");
      await inSwitcher(s, "new-quote", "household/new-quote.md");
      await s.keys("escape");
      // Searched too: a note of it never opened.
      await leader(s, "f", "s");
      await s.type("renewal");
      await s.see("household/archive/2025-policy.md:", 5000);
      await s.keys("escape");
      // The tab's note links to home's todo.md: a backlink there.
      await open(s, "todo");
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.see("household/bike-insurance.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: its tabs brought back — a split's other window's folder walked too; a file gone, or one in Downloads, walks nothing",
    covers: { cases: ["vault", "tabs", "switcher"], commands: ["window.split_side", "tab.new", "app.quit"] },
    options: {
      home: true,
      startAt: "home/household/bike-insurance.md",
      config: UNWALKED,
      setup: (s) => {
        homeFolders(s);
        if (!s.exists("~/old/kept.md")) s.write("~/old/kept.md", "# Kept\n");
      },
    },
    run: async (s) => {
      await opened(s, "household/bike-insurance.md");
      // A split, garden's plan in its other window; a tab of Downloads; one of a note about to go.
      await s.keys("ctrl+w", "v");
      await s.until(() => s.text().split("§ ").length - 1 === 2, 3000, "two windows");
      await s.ex("e garden/plan.md");
      await opened(s, "garden/plan.md");
      // New tabs by :tabnew, the split kept (ctrl+t c would take its window out into a tab of its own).
      await s.ex("tabnew Downloads/stray-note.md");
      await opened(s, "Downloads/stray-note.md");
      s.write("~/old/gone.md", "# Gone\n");
      await s.ex("tabnew old/gone.md");
      await opened(s, "old/gone.md");
      await quits(s);
      rmSync(s.path("~/old/gone.md"));
      // Home's top: its tabs back (the split named by its window in use), the gone one not.
      await s.restart({ startAt: "home" });
      await s.see(tab(1, "plan.md"));
      await s.see(tab(2, "stray-note.md"));
      // Said, and no tab for it.
      await s.see("cannot read old/gone.md");
      s.expect(!tab("\\d", "gone.md").test(s.text()), "the gone note's tab not brought back");
      // Each window's folder walked, the one in use and the other: a note of each never opened is known.
      await inSwitcher(s, "seeds", "garden/seeds.md");
      await s.keys("escape");
      await inSwitcher(s, "2025-policy", "household/archive/2025-policy.md");
      await s.keys("escape");
      // Nothing walked for the gone file's folder, nor for Downloads.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("kept");
      s.expect(s.rowOf("old/kept.md") < 0, "the gone file's folder not walked: old/kept.md not in the list");
      await s.keys("escape");
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("plan");
      s.expect(s.rowOf("Downloads/plan.md") < 0, "Downloads left out: its plan.md not in the list");
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "home: gone into from another vault, its tabs brought back — their folders walked at once, a backlink there",
    covers: { cases: ["vault", "tabs", "switcher", "links/backlinks"], commands: ["note.open", "backlinks.open"] },
    options: { home: true, startAt: "home/household/bike-insurance.md", config: UNWALKED, setup: homeFolders },
    run: async (s) => {
      await opened(s, "household/bike-insurance.md");
      await quits(s);
      // In the notes vault: home's todo.md opened by its path goes into home, its tabs back with it.
      await s.restart({ startAt: "home/notes/index.md" });
      await s.where(/^notes(?: │|$)/);
      await s.ex(`e ${s.path("~/todo.md")}`);
      await s.where("~", /todo\.md/, 5000);
      await s.see(tab(1, "bike-insurance.md"));
      await inSwitcher(s, "2025-policy", "household/archive/2025-policy.md");
      await s.keys("escape");
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.see("household/bike-insurance.md");
    },
  },
  {
    area: "links-and-files",
    name: "home a repository: a branch's tabs brought back as it's checked out — a folder of home and one only it has walked then",
    covers: { cases: ["vault", "tabs", "git", "search"], commands: ["tab.new", "search.open", "backlinks.open"] },
    options: {
      home: true,
      startAt: "home/household/bike-insurance.md",
      config: UNWALKED,
      setup: (s) => {
        homeFolders(s);
        if (s.exists("~/.git")) return;
        git(s, s.home, "init", "-q", "-b", "main");
        git(s, s.home, "add", "-f", "README.md", "todo.md", "household", "garden");
        git(s, s.home, "commit", "-q", "-m", "home");
        git(s, s.home, "checkout", "-q", "-b", "feat");
        s.write("~/household/2026/quote.md", "# Quote\n\nThe third, for [the insurance](../bike-insurance.md).\n");
        s.write("~/household/bike-insurance.md", `${s.read("~/household/bike-insurance.md")}\nRenewed on feat.\n`);
        git(s, s.home, "add", "-f", "household/2026/quote.md", "household/bike-insurance.md");
        git(s, s.home, "commit", "-q", "-m", "a quote");
        git(s, s.home, "checkout", "-q", "main");
      },
    },
    run: async (s) => {
      await opened(s, "household/bike-insurance.md");
      // On feat, two tabs more: its own note, and garden's plan; back on main, main's tab.
      git(s, s.home, "checkout", "-q", "feat");
      await s.message("switched to branch feat", 5000);
      await s.keys("ctrl+t", "c");
      await s.ex("e household/2026/quote.md");
      await opened(s, "household/2026/quote.md");
      await s.keys("ctrl+t", "c");
      await s.ex("e garden/plan.md");
      await opened(s, "garden/plan.md");
      git(s, s.home, "checkout", "-q", "main");
      await s.message("switched to branch main: its tabs are back", 5000);
      // Started again on main: household walked for its tab, garden not. feat checked out: its tabs back, their
      // folders walked then — household/2026, only feat has, and garden.
      await s.restart({ startAt: "home" });
      await s.see(tab(1, "bike-insurance.md"));
      git(s, s.home, "checkout", "-q", "feat");
      await s.message("switched to branch feat: its tabs are back", 5000);
      await s.see(tab(3, "plan.md"));
      // The note open on main's tab, changed by the checkout: read again once — after the tabs' folders were walked,
      // never before git's batch and again with it.
      await sleep(1500);
      const said = await messagesSaying(
        s,
        "bike-insurance.md changed",
        /bike-insurance\.md changed on disk — reloaded/,
      );
      s.expect(said === 1, `the open note read again once, not ${said} times`);
      await inSwitcher(s, "seeds", "garden/seeds.md");
      await s.keys("escape");
      await leader(s, "f", "s");
      await s.type("sow");
      await s.see("garden/seeds.md:", 5000);
      await s.keys("escape");
      await open(s, "bike-insurance");
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.see("household/2026/quote.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: a tab behind a link out of home not followed isn't brought back, nothing read through it",
    covers: { cases: ["vault", "tabs", "links/state", "safety"], commands: ["note.open", "app.quit"] },
    options: {
      home: true,
      startAt: "home/README.md",
      config: UNWALKED,
      setup: (s) => {
        if (!existsSync(join(s.dir, "tmp", "ext", "far.md"))) {
          mkdirSync(join(s.dir, "tmp", "ext"), { recursive: true });
          writeFileSync(join(s.dir, "tmp", "ext", "far.md"), "# Far\n\nOutside home.\n");
        }
        symlinkOnce(join(s.dir, "tmp", "ext"), s.path("~/ext"));
      },
    },
    run: async (s) => {
      // Looked at through the link, this once: a tab kept.
      await s.ex("e ext/far.md");
      await s.see("follow it?", 5000);
      await s.keys("l");
      await s.see("Outside home.");
      await quits(s);
      // Started again: the tab isn't read through the link, and says why.
      await s.restart({ startAt: "home" });
      const said = await lastMessage(s, "isn't followed");
      s.expect(/^~\/ext → .* isn't followed — open it to choose$/.test(said), `said why: ${said}`);
      s.expect(!/far\.md/.test(s.statusLine()), "nothing read through the link");
      s.expect(!s.text().includes("Outside home."), "its text not shown");
    },
  },
  {
    area: "links-and-files",
    name: "home: a note gone forward to in a folder not walked — read again when changed, home's note once home's walk reaches it",
    covers: { cases: ["vault", "links/backlinks", "watching"], commands: ["history.forward", "backlinks.open"] },
    options: {
      home: true,
      startAt: "home/README.md",
      config: UNWALKED,
      setup: (s) => {
        homeFolders(s);
        if (!s.read("~/garden/seeds.md").includes("plan.md"))
          s.write("~/garden/seeds.md", "# Seeds\n\nFor [the plan](plan.md).\n");
      },
    },
    run: async (s) => {
      // garden's plan, opened and gone back from: forward in README's window's history.
      await s.ex("e garden/plan.md");
      await opened(s, "garden/plan.md");
      await s.keys("ctrl+o");
      await opened(s, "README.md");
      await quits(s);
      // Started again, home walked once nobody has worked for 3 s: forward to the plan, garden not walked yet.
      const config = join(s.dir, "config", "slipbox", "config.toml");
      s.write(config, s.read(config).replace("idle_seconds = 86400", "idle_seconds = 3"));
      await s.restart({ startAt: "home" });
      await leader(s, "h", "n");
      await opened(s, "garden/plan.md");
      // Changed elsewhere: read again.
      s.write("~/garden/plan.md", "# Garden plan\n\nBeds by the fence; the herbs moved to the window.\n");
      await s.see("the herbs moved to the window", 5000);
      // Home's walk made while nobody works (asked every 8 s, idle between): the plan is home's note, its backlink
      // found.
      await s.retry(
        async () => {
          if (s.rowOf("Linking to") >= 0) await s.keys("escape");
          await leader(s, "l", "b");
        },
        () => s.rowOf("Linking to plan.md (1)") >= 0,
        "plan.md's backlink, from seeds.md, once home is walked",
        8000,
        90_000,
      );
      await s.see("garden/seeds.md");
      await s.keys("escape");
      await s.see("the herbs moved to the window");
    },
  },
  {
    area: "links-and-files",
    name: "home: a note typed in before its folder is walked, changed by an agent — theirs loaded, home's note once walked",
    covers: { cases: ["vault", "watching", "links/backlinks"], commands: ["history.forward", "backlinks.open"] },
    options: {
      home: true,
      startAt: "home/README.md",
      config: UNWALKED,
      setup: (s) => {
        homeFolders(s);
        if (!s.read("~/garden/seeds.md").includes("plan.md"))
          s.write("~/garden/seeds.md", "# Seeds\n\nFor [the plan](plan.md).\n");
      },
    },
    run: async (s) => {
      await s.ex("e garden/plan.md");
      await opened(s, "garden/plan.md");
      await s.keys("ctrl+o");
      await opened(s, "README.md");
      await quits(s);
      // Started again, home walked once nobody has worked for 3 s; forward to the plan, garden not walked yet.
      const config = join(s.dir, "config", "slipbox", "config.toml");
      s.write(config, s.read(config).replace("idle_seconds = 86400", "idle_seconds = 3"));
      await s.restart({ startAt: "home" });
      await leader(s, "h", "n");
      await opened(s, "garden/plan.md");
      // Typed in, unsaved; rewritten by an agent: asked which to keep.
      await s.keys("i");
      await s.type("Mine. ");
      await s.keys("escape");
      s.write("~/garden/plan.md", "# Garden plan\n\nTheirs: the herbs by the window.\n");
      await s.see("Load theirs", 5000);
      // Home walked while the question waits (nobody working): then theirs loaded, and the plan is home's note.
      await sleep(9000);
      await s.keys("l");
      await s.see("Theirs: the herbs by the window.", 5000);
      await s.retry(
        async () => {
          if (s.rowOf("Linking to") >= 0) await s.keys("escape");
          await leader(s, "l", "b");
        },
        () => s.rowOf("Linking to plan.md (1)") >= 0,
        "plan.md's backlink, from seeds.md",
        8000,
        60_000,
      );
      await s.see("garden/seeds.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: its skip list — ~/Downloads opened is left out of home's index, said why; listed in the explorer, ⊘, its folders too",
    covers: { cases: ["vault", "explorer"] },
    options: { home: true, startAt: "home/Downloads", config: UNWALKED },
    run: async (s) => {
      // Nothing opens, and not "no notes": they're there, and home's index leaves them out.
      const said = await lastMessage(s, "left out of home's index");
      s.expect(
        said ===
          "~/Downloads: left out of home's index (Downloads) — its files are listed in the explorer, not indexed",
        `why it's left out: ${said}`,
      );
      // Listed all the same, a level at a time: its files, and its folders not indexed.
      await explorerOpen(s);
      await s.until(() => /^~ › Downloads ›$/.test(crumbs(s)), 3000, "the view at ~/Downloads");
      await s.until(() => listed(s, /\sstray-note\.md$/), 3000, "Downloads' files listed");
      await s.until(() => markOf(s, "old-blog-export") === "⊘", 3000, "a folder in Downloads: ⊘");
      // In home's tree, Downloads itself: ⊘.
      await s.keys("-");
      await s.until(() => /^~ ›/.test(crumbs(s)) && markOf(s, "Downloads") === "⊘", 3000, "Downloads ⊘ in home's tree");
    },
  },
  {
    area: "links-and-files",
    name: "home: a folder whose time was set back is listed again — cp -a, tar x, a clock behind, a time put back exactly, a folder made a vault, a time ahead: at the next start of a folder of home, and at the next command",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home/household", config: UNWALKED, setup: (s) => homeWalked(s) },
    run: async (s) => {
      await s.where("household", /household\/bike-insurance\.md/);
      await quits(s);
      // slipbox closed. cp -a of a backup into ~/garden: a note, and garden's time the backup's, older than the walk.
      const older = new Date(Date.now() - 2 * 3_600_000);
      const backup = join(s.dir, "backup", "garden");
      mkdirSync(backup, { recursive: true });
      writeFileSync(join(backup, "compost.md"), "# Compost\n\nTurned every two weeks.\n");
      utimesSync(backup, older, older);
      shell("cp", "-a", `${backup}/.`, s.path("~/garden"));
      // tar x of an archive over ~/household: a note in its archive, the folders' times the archive's.
      const arc = join(s.dir, "arc");
      mkdirSync(join(arc, "household", "archive"), { recursive: true });
      writeFileSync(join(arc, "household", "archive", "2024-policy.md"), "# The policy before\n\nTwo renewals back.\n");
      for (const d of ["household/archive", "household"]) utimesSync(join(arc, d), older, older);
      shell("tar", "-C", arc, "-cf", join(s.dir, "arc.tar"), "household");
      shell("tar", "-C", s.home, "-xf", join(s.dir, "arc.tar"));
      s.expect(statSync(s.path("~/garden")).mtimeMs === older.getTime(), "garden's time set back by cp -a");
      // household opened by name again: home's walk kept covers it, and lists again the folders whose time moved back.
      await s.restart();
      await s.where("household", /household\/bike-insurance\.md/);
      await switcherShows(s, "compost", "garden/compost.md");
      await switcherShows(s, "2024-policy", "household/archive/2024-policy.md");
      await quits(s);
      // The walk the TUI kept (made on its own thread): garden's stamp as it was listed, its time and ctime.
      const g = statSync(s.path("~/garden"));
      s.expect(
        JSON.stringify(stampOf(s, "garden")) === JSON.stringify([g.mtimeMs, g.ctimeMs]),
        "garden's stamp kept whole",
      );
      // A disk whose clock is behind: a note in ~/household, its time moved, but to before the walk.
      s.write("~/household/insurer.md", "# Insurer\n\nTheir number, and the policy's.\n");
      const behind = new Date(Date.now() - 30_000);
      utimesSync(s.path("~/household"), behind, behind);
      // ~'s own: a note, and its time put back to exactly the one the walk kept: its ctime moved all the same.
      const top = stampOf(s, "");
      if (!top || top[0] === -1) throw new CheckFailed("home's top has no stamp of its time");
      s.write("~/put-back.md", "# Put back\n\nCame in, its folder's time restored.\n");
      utimesSync(s.home, new Date(top[0]), new Date(top[0]));
      s.expect(statSync(s.home).mtimeMs === top[0], "home's time put back to exactly its stamp");
      // garden made a vault (git init), its time set back as if nothing had come: it leaves home.
      mkdirSync(s.path("~/garden/.git"));
      utimesSync(s.path("~/garden"), older, older);
      // The command line, at its next command: the notes there, garden's gone.
      const ls = s.cliIn("~/", "ls").out.split("\n");
      for (const n of ["household/insurer.md", "put-back.md", "household/archive/2024-policy.md"])
        s.expect(ls.includes(n), `ls lists ${n}`);
      s.expect(!ls.some((n) => n.startsWith("garden/")), "garden made a vault: none of its notes home's");
      // A folder whose time is too recent to tell a later change apart — ahead of this machine's clock (a disk whose
      // clock is ahead), as one just changed: a note in it, the walk kept with it stamped to list again; so a note come
      // later, its time the same, is found.
      const ahead = new Date(Date.now() + 60_000);
      s.write("~/household/archive/2023-policy.md", "# The first policy\n\nThree renewals back.\n");
      utimesSync(s.path("~/household/archive"), ahead, ahead);
      s.expect(s.cliIn("~/", "ls").out.split("\n").includes("household/archive/2023-policy.md"), "ls lists it");
      s.expect(stampOf(s, "household/archive")?.[0] === -1, "household/archive stamped to list again");
      s.write("~/household/archive/2022-policy.md", "# The one before\n\nFour renewals back.\n");
      utimesSync(s.path("~/household/archive"), ahead, ahead);
      s.expect(s.cliIn("~/", "ls").out.split("\n").includes("household/archive/2022-policy.md"), "ls lists it");
    },
  },
  {
    area: "links-and-files",
    name: "home: a folder whose time was set back with nothing new in it — the walk kept again with its new time, so the next start doesn't list it again",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home", config: UNWALKED, setup: (s) => homeWalked(s) },
    run: async (s) => {
      await s.where(/^~(?: |$)/);
      await quits(s);
      const garden = s.path("~/garden");
      // cp -a of a backup holding the same notes: garden's time the backup's — before its stamp, then after it but
      // still before the walk (a backup made since). Each time the command line lists garden again, and keeps the
      // walk again with garden's new time.
      const backup = join(s.dir, "backup", "garden");
      mkdirSync(backup, { recursive: true });
      for (const n of ["plan.md", "seeds.md"]) writeFileSync(join(backup, n), readFileSync(join(garden, n)));
      for (const ago of [90, 30]) {
        const at = new Date(Date.now() - ago * 60_000);
        utimesSync(backup, at, at);
        shell("cp", "-a", `${backup}/.`, garden);
        s.expect(s.cliIn("~/", "ls").out.includes("garden/plan.md"), "ls lists garden's notes");
        s.expect(stampOf(s, "garden")?.[0] === at.getTime(), `garden's stamp its time now (${ago} minutes back)`);
      }
      // As a walk made in slices leaves it, begun two hours back, before garden was listed: garden set back to before
      // its stamp but after the walk began is kept again all the same.
      const file = walkJson(s);
      const begun = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify({ ...begun, walked: new Date(Date.now() - 2 * 3_600_000).toISOString() }));
      const between = new Date(Date.now() - 60 * 60_000);
      utimesSync(backup, between, between);
      shell("cp", "-a", `${backup}/.`, garden);
      s.expect(s.cliIn("~/", "ls").out.includes("garden/plan.md"), "ls lists garden's notes");
      s.expect(stampOf(s, "garden")?.[0] === between.getTime(), "garden's stamp its time now (an hour back)");
      // household's time moved on past the walk's start and its stamp, nothing new in it (a shell's history written
      // over): listed again, as "newer than the walk" listed it, and the walk not written again for it.
      const since = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify({ ...since, walked: new Date(Date.now() - 2 * 3_600_000).toISOString() }));
      const before = readFileSync(file, "utf8");
      const recent = new Date(Date.now() - 30_000);
      utimesSync(s.path("~/household"), recent, recent);
      s.expect(s.cliIn("~/", "ls").out.includes("household/bike-insurance.md"), "ls lists household's notes");
      s.expect(readFileSync(file, "utf8") === before, "the walk not written again for a time moved on");
      // Not listed again at the next start: a note taken out of the walk kept stays out of the switcher — the walk's
      // folders and their stamps in another order, each stamp staying with its folder.
      const kept = JSON.parse(readFileSync(file, "utf8"));
      kept.dirs.push(kept.dirs.shift());
      kept.times.push(kept.times.shift());
      writeFileSync(
        file,
        JSON.stringify({ ...kept, notes: kept.notes.filter((n: string) => n !== "garden/seeds.md") }),
      );
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "plan", "garden/plan.md");
      await switcherShows(s, "seeds", "garden/seeds.md", false);
    },
  },
  {
    area: "links-and-files",
    name: "home: a walk an earlier version kept, without its folders' times — the TUI goes by it as before; the command line walks home again, once, and a note whose folder was set back is found",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: {
      home: true,
      startAt: "home",
      config: UNWALKED,
      setup: (s) =>
        homeWalked(s, () => {
          // As an earlier version kept it: no stamps. Then a note in garden, its time set back.
          const file = walkJson(s);
          const { times: _, ...kept } = JSON.parse(readFileSync(file, "utf8"));
          writeFileSync(file, JSON.stringify(kept));
          s.write("~/garden/late.md", "# Late\n\nBrought in from a backup.\n");
          const older = new Date(Date.now() - 2 * 3_600_000);
          utimesSync(s.path("~/garden"), older, older);
        }),
    },
    run: async (s) => {
      await s.where(/^~(?: |$)/);
      // The TUI goes by the walk as an earlier version did: garden's time older than the walk, not listed again.
      await switcherShows(s, "late", "garden/late.md", false);
      await quits(s);
      // A note in household, so the TUI keeps the walk again: household stamped, garden still not.
      s.write("~/household/renewal.md", "# Renewal\n\nDue in March.\n");
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "renewal", "household/renewal.md");
      await quits(s);
      s.expect(
        Array.isArray(stampOf(s, "household")) && stampOf(s, "garden") === null,
        "household stamped, garden not",
      );
      // The command line walks home again, once, as the first time: the note found, every folder stamped.
      s.expect(s.cliIn("~/", "ls").out.split("\n").includes("garden/late.md"), "ls lists garden/late.md");
      const kept = JSON.parse(readFileSync(walkJson(s), "utf8"));
      s.expect(
        kept.dirs.every((_: string, i: number) => Array.isArray(kept.times?.[i])),
        "every folder stamped",
      );
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "late", "garden/late.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: a folder that can't be read for a while — listed again at each start till it can, the walk not written for it each time; readable again, its notes back",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home", config: UNWALKED, setup: (s) => homeWalked(s) },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      await s.where(/^~(?: |$)/);
      await quits(s);
      const garden = s.path("~/garden");
      chmodSync(garden, 0o000);
      try {
        // Its ctime moved by the chmod: the command line lists it again, and can't read it — its notes out meanwhile.
        // Home's top listed again too (a note in it, its time then set back): read, it keeps the stamp it was read with.
        s.write("~/sown.md", "# Sown\n\nWhat went in this spring.\n");
        const back = new Date(Date.now() - 2 * 3_600_000);
        utimesSync(s.home, back, back);
        const ls = s.cliIn("~/", "ls").out;
        s.expect(!ls.includes("garden/") && ls.includes("sown.md"), "garden's notes out, sown.md in");
        s.expect(stampOf(s, "garden")?.[0] === -1, "garden to list again");
        s.expect(stampOf(s, "")?.[0] === back.getTime(), "home's top keeps its own stamp");
        const at = readFileSync(walkJson(s), "utf8");
        // The next start lists it again, and still can't read it: the walk not written again for it.
        await s.restart();
        await s.where(/^~(?: |$)/);
        await switcherShows(s, "plan", "garden/plan.md", false);
        await quits(s);
        s.expect(readFileSync(walkJson(s), "utf8") === at, "the walk not written again");
      } finally {
        chmodSync(garden, 0o755);
      }
      // Readable again: listed again, its notes back.
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "plan", "garden/plan.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: a walk an earlier version kept — a vault in home previewed as part of it from the TUI goes by that walk, home not walked again for want of its stamps",
    covers: { cases: ["vault", "links/state"], commands: ["vault.unmake"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      config: UNWALKED,
      setup: (s) =>
        homeWalked(s, () => {
          const file = walkJson(s);
          const { times: _, ...kept } = JSON.parse(readFileSync(file, "utf8"));
          writeFileSync(file, JSON.stringify(kept));
        }),
    },
    run: async (s) => {
      await s.where(/^notes(?: |$)/, /index\.md/);
      // notes made part of home: the plan across home, from the walk kept as it is — previewed, not carried out.
      await leader(s, "v", "shift+m");
      await s.see(/notes\/ → part of .*: \d+ changes? in \d+ files?/, 10000);
      await s.keys("escape");
      s.expect(s.exists("~/notes/.slipbox"), "notes still a vault of its own");
      // A walk of home would have stamped every folder: garden, unchanged, has none still.
      s.expect(stampOf(s, "garden") === null, "home not walked again: garden without a stamp");
    },
  },
  {
    area: "links-and-files",
    name: "home: a folder that can't be read when home is walked — tried again at each start; made readable, its notes found at the next command",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: {
      home: true,
      startAt: "home",
      config: UNWALKED,
      setup: (s) => {
        const once = join(s.dir, "home-folders"); // not a file of home's: garden may not be readable by then
        if (existsSync(once)) return;
        writeFileSync(once, "");
        homeFolders(s);
      },
    },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      await s.where(/^~(?: |$)/);
      await quits(s);
      const garden = s.path("~/garden");
      try {
        // garden unreadable as the command line walks home for the first time: not in the walk at all, and the folder
        // holding it, home's top, stamped to list again.
        chmodSync(garden, 0o000);
        s.expect(!s.cliIn("~/", "ls").out.includes("garden/"), "garden unreadable: none of its notes listed");
        s.expect(stampOf(s, "garden") === undefined && stampOf(s, "")?.[0] === -1, "home's top stamped to list again");
        // Each start tries garden again, and still can't read it: the walk not written again for it.
        const at = readFileSync(walkJson(s), "utf8");
        await s.restart();
        await s.where(/^~(?: |$)/);
        await switcherShows(s, "plan", "garden/plan.md", false);
        await quits(s);
        s.expect(readFileSync(walkJson(s), "utf8") === at, "the walk not written again");
        // Made readable (a chmod moves no time the walk keeps): found at the next command, and the next start.
        chmodSync(garden, 0o755);
        s.expect(s.cliIn("~/", "ls").out.split("\n").includes("garden/plan.md"), "ls lists garden/plan.md");
      } finally {
        chmodSync(garden, 0o755);
      }
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "plan", "garden/plan.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: a vault of home that's home's again, unreadable then — tried again at each command; made readable, its notes found",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home", config: UNWALKED, setup: (s) => homeWalked(s) },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      await s.where(/^~(?: |$)/);
      await quits(s);
      // ~/plot made a vault (git init): the command line keeps it as a vault of its own.
      s.write("~/plot/.git/HEAD", "ref: refs/heads/main\n");
      s.write("~/plot/beds.md", "# Beds\n\nFour, by the fence.\n");
      s.expect(!s.cliIn("~/", "ls").out.includes("plot/"), "plot a vault of its own: none of its notes home's");
      // Home's top, listed just after plot came, is to list again: its time set back, the next command stamps it.
      const back = new Date(Date.now() - 3_600_000);
      utimesSync(s.home, back, back);
      s.cliIn("~/", "ls");
      s.expect(stampOf(s, "")?.[0] === back.getTime(), "home's top stamped with its time");
      const plot = s.path("~/plot");
      try {
        // Its marker gone, and it can't be read (searched, not listed): home's again, and tried again from home's top.
        rmSync(join(plot, ".git"), { recursive: true, force: true });
        chmodSync(plot, 0o311);
        s.expect(!s.cliIn("~/", "ls").out.includes("plot/"), "plot unreadable: none of its notes listed");
        s.expect(stampOf(s, "")?.[0] === -1, "home's top stamped to list again");
        chmodSync(plot, 0o755);
        s.expect(s.cliIn("~/", "ls").out.split("\n").includes("plot/beds.md"), "ls lists plot/beds.md");
      } finally {
        chmodSync(plot, 0o755);
      }
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "beds", "plot/beds.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: a walk that couldn't read home's top — no walk of home's: the TUI shows home's top, the command line walks it again at its next command",
    covers: { cases: ["vault"] },
    options: {
      home: true,
      startAt: "home",
      config: UNWALKED,
      setup: (s) => {
        const once = join(s.dir, "home-walked");
        if (existsSync(once) || process.getuid?.() === 0) return;
        writeFileSync(once, "");
        homeFolders(s);
        chmodSync(s.home, 0o311); // searched, not listed
        try {
          s.cliIn("~/", "ls");
        } finally {
          chmodSync(s.home, 0o755);
        }
      },
    },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      // The TUI, its top readable again: home's top shown, as for a walk under other settings, not an empty home.
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "todo", "todo.md");
      await quits(s);
      s.expect(JSON.parse(readFileSync(walkJson(s), "utf8")).dirs.length === 0, "the walk kept holds no folder");
      s.expect(s.cliIn("~/", "ls").out.split("\n").includes("household/bike-insurance.md"), "ls walks home again");
      s.expect(Array.isArray(stampOf(s, "")), "home's top stamped");
    },
  },
  {
    area: "links-and-files",
    name: "home: a folder or a note of home that can't be looked at any more — tried again from the folder holding it, not dropped for good; looked at again, its notes back",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home", config: UNWALKED, setup: (s) => homeWalked(s) },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      await s.where(/^~(?: |$)/);
      await quits(s);
      const household = s.path("~/household");
      try {
        // household readable, not searched: its archive can't be statted, as a permission, a policy or a disk's error
        // can have it. The walk kept as if it had seen household so: the archive alone lost, household to list again.
        chmodSync(household, 0o600);
        restampOf(s, "household");
        s.expect(!s.cliIn("~/", "ls").out.includes("household/archive/"), "the archive's notes out");
        s.expect(stampOf(s, "household")?.[0] === -1, "household stamped to list again");
        chmodSync(household, 0o755);
        s.expect(s.cliIn("~/", "ls").out.split("\n").includes("household/archive/2025-policy.md"), "ls lists it");
      } finally {
        chmodSync(household, 0o755);
      }
      const garden = s.path("~/garden");
      try {
        // garden the same: its notes can't be statted, garden to list again — and listed again, still, while they can't.
        chmodSync(garden, 0o600);
        restampOf(s, "garden");
        s.expect(!s.cliIn("~/", "ls").out.includes("garden/"), "garden's notes out");
        s.expect(stampOf(s, "garden")?.[0] === -1, "garden stamped to list again");
        s.cliIn("~/", "ls");
        s.expect(stampOf(s, "garden")?.[0] === -1, "garden still to list again");
        chmodSync(garden, 0o755);
        s.expect(s.cliIn("~/", "ls").out.split("\n").includes("garden/plan.md"), "ls lists garden/plan.md");
      } finally {
        chmodSync(garden, 0o755);
      }
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "2025-policy", "household/archive/2025-policy.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: a walk that couldn't read home's top — a vault in home previewed as part of it from the TUI walks home again for the plan",
    covers: { cases: ["vault", "links/state"], commands: ["vault.unmake"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      config: UNWALKED,
      setup: (s) => {
        const once = join(s.dir, "home-walked");
        if (existsSync(once) || process.getuid?.() === 0) return;
        writeFileSync(once, "");
        homeFolders(s);
        chmodSync(s.home, 0o311); // searched, not listed
        try {
          s.cliIn("~/", "ls");
        } finally {
          chmodSync(s.home, 0o755);
        }
      },
    },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      await s.where(/^notes(?: |$)/, /index\.md/);
      s.expect(JSON.parse(readFileSync(walkJson(s), "utf8")).dirs.length === 0, "the walk kept holds no folder");
      // The plan across home, previewed, not carried out: from a walk of home made for it, not the empty one.
      await leader(s, "v", "shift+m");
      await s.see(/notes\/ → part of .*: \d+ changes? in \d+ files?/, 10000);
      await s.keys("escape");
      s.expect(Array.isArray(stampOf(s, "garden")), "home walked again for the plan: garden stamped");
    },
  },
  {
    area: "links-and-files",
    name: "home: a vault and a folder of home through a link the walk follows, its target away for a while (a disk taken away, not searched) — found again when it's back",
    covers: { cases: ["vault"] },
    options: {
      home: true,
      startAt: "home",
      config: UNWALKED,
      setup: (s) => {
        const once = join(s.dir, "home-walked");
        if (existsSync(once)) return;
        writeFileSync(once, "");
        homeFolders(s);
        // ~/lnk leads to a vault on another disk, followed, as the question's f keeps it.
        const proj = join(s.dir, "disk", "proj");
        mkdirSync(join(proj, ".git"), { recursive: true });
        writeFileSync(join(proj, "p.md"), "# P\n\nOn the other disk.\n");
        symlinkSync(proj, s.path("~/lnk"));
        mkdirSync(join(s.dir, "state", "slipbox"), { recursive: true });
        writeFileSync(
          join(s.dir, "state", "slipbox", "links.json"),
          JSON.stringify({
            version: 1,
            links: [{ link: s.path("~/lnk"), target: proj, answer: "follow", at: "2026-10-24" }],
          }),
        );
        s.cliIn("~/", "ls");
      },
    },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      await s.where(/^~(?: |$)/);
      await quits(s);
      const disk = join(s.dir, "disk");
      const proj = join(disk, "proj");
      s.expect(stampOf(s, "") !== undefined && !s.cliIn("~/", "ls").out.includes("lnk/"), "lnk a vault of its own");
      // The disk taken away: the link there, what it leads to not. Home's top to list again, command after command.
      renameSync(proj, join(disk, "proj-away"));
      s.cliIn("~/", "ls");
      s.cliIn("~/", "ls");
      s.expect(stampOf(s, "")?.[0] === -1, "home's top to list again, lnk's target away");
      // Back, its marker gone meanwhile: home's again, its note found.
      renameSync(join(disk, "proj-away"), proj);
      rmSync(join(proj, ".git"), { recursive: true });
      s.expect(s.cliIn("~/", "ls").out.split("\n").includes("lnk/p.md"), "ls lists lnk/p.md");
      try {
        // The disk not searched, home's top listed again meanwhile (a note in it, its time set back): lnk's note out,
        // and home's top to list again till it can be looked at.
        chmodSync(disk, 0o600);
        s.write("~/sown.md", "# Sown\n\nWhat went in this spring.\n");
        const back = new Date(Date.now() - 2 * 3_600_000);
        utimesSync(s.home, back, back);
        s.expect(!s.cliIn("~/", "ls").out.includes("lnk/"), "lnk's note out");
        s.cliIn("~/", "ls");
        s.expect(stampOf(s, "")?.[0] === -1, "home's top to list again, lnk's target not searched");
      } finally {
        chmodSync(disk, 0o755);
      }
      s.expect(s.cliIn("~/", "ls").out.split("\n").includes("lnk/p.md"), "lnk/p.md back once its disk is searched");
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "p.md", "lnk/p.md");
    },
  },
];
