// Named folders, their copies and pointers, and linked-folder search (TT-T6).

import { readFileSync } from "node:fs";
import { type Check, follow, leader, moveTo, opened } from "../check.ts";
import type { Session } from "../session.ts";
import { lastMessage, PEEK_HINT } from "../support/links.ts";

/** The rows of the list on screen that name the worktree of kestrel's agent branch. */
const worktreeRows = (s: Session) => s.screen().filter((r) => r.includes("kestrel-agent-sync-retry"));

export const NAMED: Check[] = [
  {
    area: "links-and-files",
    name: "named folders: a second copy of notes asks once which links open; a repository named by its remote (21.6)",
    covers: { cases: ["links/named-folders", "vault"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      // The backup in Downloads is a copy of notes (one .slipbox/ id): opened, it asks which copy links open.
      await s.restart({ startAt: "home/Downloads/notes-backup-2026-07/index.md" });
      await s.see("notes: 2 copies on this machine — which do links to it open?");
      await s.see("links open it now"); // ~/notes: the first found
      await s.keys("enter");
      await s.message("links to notes open ~/notes");
      const info = s.cliIn("~/Downloads/notes-backup-2026-07", "info");
      s.expect(info.out.includes("name      notes — 2 copies, links open ~/notes"), `info:\n${info.out}`);
      // Asked once: opened again, not asked.
      await s.restart({ startAt: "home/Downloads/notes-backup-2026-07/index.md" });
      await s.notSee("which do links to it open?", 1500);
      // The product repository, no .slipbox/ name: named by its remote, its qualified name kept.
      const product = JSON.parse(s.cliIn("~/work/product", "info", "--json").out).data.folder;
      s.expect(
        product?.name === "product" && product.remote === "github.com/kestrel-labs/product",
        `product's name: ${JSON.stringify(product)}`,
      );
      // A folder with only Obsidian's marker: unnamed, linked by relative path.
      const cooking = s.cliIn("~/hobbies/cooking", "info");
      s.expect(cooking.out.includes("name      none — no remote and no .slipbox/ name"), `cooking:\n${cooking.out}`);
    },
  },
  {
    area: "links-and-files",
    name: "named folders: space v shift+v picks which copy a folder's links open, :folders-default again; info says which (21.6)",
    covers: { cases: ["links/named-folders", "vault"], commands: ["folders.default"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      // Both copies of notes known here (an agent's ls in each), links opening ~/notes: nothing asked at the start.
      setup: (s) => {
        s.cliIn("~/notes", "ls");
        s.cliIn("~/Downloads/notes-backup-2026-07", "ls");
        const r = s.cliIn("~/notes", "folders", "default", "notes", s.path("~/notes"));
        if (r.out !== "links to notes open ~/notes\n") throw new Error(`folders default: ${r.code} ${r.out}`);
      },
    },
    run: async (s) => {
      const marked = () => s.screen().find((r) => r.includes("links open it")) ?? "";
      const info = () => s.cliIn("~/notes", "info").out;
      await leader(s, "v", "shift+v");
      await s.see("notes: which copy do links open?");
      await s.until(
        () => marked().includes("~/notes") && !marked().includes("backup"),
        3000,
        "~/notes marked as the copy links open",
      );
      await s.see("~/Downloads/notes-backup-2026-07");
      await s.keys("down", "enter");
      await s.message("links to notes open"); // the path wraps on
      await s.notSee("which copy do links open?");
      s.expect(
        info().includes("name      notes — 2 copies, links open ~/Downloads/notes-backup-2026-07"),
        `info:\n${info()}`,
      );
      // Again by its command: the backup marked now; ~/notes picked back.
      await s.ex("folders-default");
      await s.see("notes: which copy do links open?");
      await s.until(() => marked().includes("notes-backup-2026-07"), 3000, "the backup marked as the copy links open");
      await s.keys("up", "enter");
      await s.notSee("which copy do links open?");
      s.expect(info().includes("name      notes — 2 copies, links open ~/notes\n"), `info:\n${info()}`);
    },
  },
  {
    area: "links-and-files",
    name: "pointers: slipbox:// — another named folder's note, once it's on this machine; an agent's branch, its worktree (21.7)",
    covers: { cases: ["links/named-folders", "links/forms", "links/git"], commands: ["link.follow"] },
    options: { home: true, startAt: "home/hobbies/cycling/rides/202608301800-kyoto-river-loop.md" },
    run: async (s) => {
      // photography hasn't been opened here yet: said so, nothing made.
      await follow(s, "Kyoto notes");
      await s.message("photography isn't on this machine yet");
      // Opened once (an agent's ls): in the lookup, and the pointer leads there.
      s.cliIn("~/hobbies/photography", "ls");
      await follow(s, "Kyoto notes");
      await s.see("photography › trips/", 5000); // a peek (VV-D7): o goes into photography
      await s.keys("o");
      await s.notSee(PEEK_HINT);
      await s.where(/^photography(?: │|$)/);
      await s.see("Kyoto"); // the trip's index, in the photography folder
      // kestrel's sync doc: Sam's notes (the notes folder), and the agent's copy on its branch — its worktree.
      s.cliIn("~/notes", "ls");
      await s.restart({ startAt: "home/work/kestrel/docs/sync.md" });
      await follow(s, "his notes");
      await s.see("notes › projects/sync-rewrite.md", 5000);
      await s.keys("o");
      await s.notSee(PEEK_HINT);
      await s.where(/^notes(?: │|$)/);
      await opened(s, "projects/sync-rewrite.md");
      await s.restart({ startAt: "home/work/kestrel/docs/sync.md" });
      await s.keys("/");
      await s.type("is at");
      await s.keys("enter", "escape", "tab", "enter");
      await s.see(PEEK_HINT, 5000);
      await s.keys("o");
      await s.notSee(PEEK_HINT);
      await s.where(/^kestrel │ agent\/sync-retry\b/);
      await opened(s, "docs/sync.md");
    },
  },
  {
    area: "links-and-files",
    name: "naming: :name names the cooking vault, its pointer resolves, and vaults lists it (21.10)",
    covers: { cases: ["links/named-folders", "rename", "links/state"], commands: ["folder.name"] },
    options: { home: true, startAt: "home/hobbies/cooking/Home.md" },
    run: async (s) => {
      await s.ex("name cooking");
      await s.message("is named cooking (.slipbox/"); // the box wraps the rest
      await s.where(/^cooking(?: │|$)/);
      s.expect(
        readFileSync(s.path("~/hobbies/cooking/.slipbox/config.toml"), "utf8").includes('name = "cooking"'),
        "the name written into .slipbox/",
      );
      const r = JSON.parse(s.cliIn("~/notes", "resolve", "slipbox://cooking/Home.md", "--json").out).data;
      s.expect(r.status === "resolved" && r.name === "cooking", `the pointer: ${JSON.stringify(r)}`);
      const vaults = JSON.parse(s.cliIn("~/notes", "vaults", "--json").out).data;
      s.expect(
        vaults.some((row: { label: string }) => row.label === "cooking"),
        "slipbox vaults includes the named vault",
      );
      s.expect(s.cliIn("~/notes", "vault-moved").code === 2, "slipbox vault-moved is gone");
      const info = JSON.parse(s.cliIn("~/hobbies/cooking", "info", "--json").out).data;
      s.expect(
        info.name === "cooking" && info.vault === undefined && info.instance === undefined,
        `info: ${JSON.stringify({ name: info.name, vault: info.vault })}`,
      );
    },
  },
  {
    area: "links-and-files",
    name: "naming: space v n names this root anew, after a preview — paths into it and out of it as they were (21.10)",
    covers: { cases: ["links/named-folders", "rename"], commands: ["folder.name"] },
    run: async (s) => {
      const outreach = s.read("outreach/index.md");
      await leader(s, "v", "n");
      await s.see("as pointers"); // the question wraps after it, or before "name" where its path is long (macOS's)
      await s.keys("ctrl+u");
      await s.type("halden2");
      await s.keys("enter");
      await s.see(/name halden → halden2: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("named the folder halden → halden2");
      await s.where(/^halden2(?: │|$)/);
      s.expect(s.read(".slipbox/config.toml").includes('name = "halden2"'), "the new name in .slipbox/");
      s.expect(s.read("outreach/index.md") === outreach, "the nested root's paths out as they were");
    },
  },
  {
    area: "links-and-files",
    name: "pointers: a clone named its own way — the qualified pointer and the hosting URL open ~/work/kestrel (DF-T5)",
    covers: { cases: ["links/named-folders", "links/forms"], commands: ["link.follow"] },
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
      // `slipbox://github.com/kestrel-labs/kestrel/docs/architecture.md`: the copy called by the remote's name.
      await follow(s, "qualified.");
      await s.see("kestrel › docs/architecture.md", 5000); // a peek (VV-D7): o goes there
      await s.keys("o");
      await s.where(/^kestrel(?: │|$)/);
      await opened(s, "docs/architecture.md");
      s.expect(!/engine-spike/.test(s.whereText()), `kestrel, not the spike:\n${s.topBar()}`);
      // A hosting URL to the repository, from product's README: the same copy, at its top.
      await s.restart({ startAt: "home/work/product/README.md" });
      await s.where(/^product(?: │|$)/);
      await s.keys("/");
      await s.type("code is in");
      await s.keys("enter", "escape", "tab");
      await s.status(/→ https:\/\/github\.com\/kestrel-labs\/kestrel\b/);
      await s.keys("enter");
      await s.see("kestrel › README.md", 5000);
      await s.keys("o");
      await s.where(/^kestrel(?: │|$)/);
      await opened(s, "README.md");
      s.expect(!/engine-spike/.test(s.whereText()), `kestrel, not the spike:\n${s.topBar()}`);
    },
  },
  {
    area: "links-and-files",
    name: "search: widened to the folders linked to this one — a repository's hits, none from its agent's worktree (DF-T5)",
    covers: { cases: ["links/search"], commands: ["search.open"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      setup: (s) => {
        s.cliIn("~/notes/research/route-engine-spike", "ls");
        s.cliIn("~/work/kestrel", "ls");
      },
    },
    run: async (s) => {
      // link-styles.md points into the worktree by `@agent/sync-retry` (its runbook says "parks at once"); kestrel's
      // own sync doc says it too.
      await leader(s, "f", "s");
      await s.type("parks");
      await s.see(/"parks" — \d+ files?/, 15000); // once notes/ is indexed
      await s.keys("ctrl+a");
      await s.see("and the folders linked to it");
      await s.see("~/work/kestrel/docs/sync.md", 10000);
      s.expect(!worktreeRows(s).length, `no hit from the worktree:\n${worktreeRows(s).join("\n")}`);
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "links: a missing heading or block opens the note at its top, said so; the hover says it first (DF-D26)",
    covers: { cases: ["links/fragments", "links"], commands: ["link.follow", "lsp.hover"] },
    options: { home: true, startAt: "home/notes/meetings/2026-09-05-feedback-synthesis.md" },
    run: async (s) => {
      // F7 (DF-D26): the hover on such a link says where following it lands.
      await s.keys("/");
      await s.type("the pricing section");
      await s.keys("enter", "escape", "shift+k");
      await s.see('No heading "pricing" in', 5000);
      await s.see("its top."); // the sentence ends so, wrapped in the hover however wide it is
      await s.keys("escape");
      // The PRD read far down, then links to a heading and a block it hasn't: each opens it at its top, said so.
      await s.restart({ startAt: "home/work/product/prd/route-sharing.md" });
      await moveTo(s, ["shift+g"], (l) => l > 50, "the PRD's end");
      for (const [link, said] of [
        ["the pricing section", 'no heading "pricing" in'],
        ["in the third paragraph", "no block ^trim-decision in"],
      ] as const) {
        await s.restart({ startAt: "home/notes/meetings/2026-09-05-feedback-synthesis.md" });
        await follow(s, link);
        await s.see("product › prd/route-sharing.md", 5000); // a peek (VV-D7), at its top; o goes there
        await s.keys("o");
        await opened(s, "prd/route-sharing.md");
        await s.where(/^product(?: │|$)/);
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
];
