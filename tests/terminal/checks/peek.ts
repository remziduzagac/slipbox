import { type Check, follow, leader, opened } from "../check.ts";
import { type Session, sleep } from "../session.ts";
import { linkHere, ARCHITECTURE, PEEK_HINT } from "../support/links.ts";

/** The peek's title, `kestrel › docs/architecture.md`: the column it starts at, -1 while no peek shows it. */
function peekTitleAt(s: Session, title: string): number {
  const row = s.screen().find((r) => r.includes(title));
  return row ? [...row].join("").indexOf(title) : -1;
}

export const PEEK: Check[] = [
  {
    area: "links-and-files",
    name: "peek: a link into another vault peeks, notes left as it was — esc back where you were, z fills the screen, t keeps it as a tab, o goes there (VV-D7)",
    covers: {
      cases: ["links/travel", "links/roots", "links/backlinks", "vault"],
      commands: ["link.follow", "peek.fill", "peek.tab", "peek.go", "history.back"],
    },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      const title = "kestrel › docs/architecture.md";
      // notes indexed whole, its index on disk for kestrel to read (17.11).
      await leader(s, "l", "b");
      await s.see("Linking to", 10000);
      await s.keys("escape");
      // Into kestrel by its path: read in a peek, this vault's status line, its note's path the peek's.
      await follow(s, ARCHITECTURE);
      await s.see(title, 5000);
      await s.see(PEEK_HINT);
      await s.where(/^notes(?: │|$)/, /kestrel: docs\/architecture\.md/);
      // Its backlinks: kestrel has no index here yet, so the peek builds it on a thread of its own, and lists them
      // when it's done (D259), notes' among them: at its end, then at the list's once it's there.
      await s.keys("shift+g");
      await s.see(/Linked from \(\d+\):/, 10000);
      await s.keys("shift+g");
      await s.see(/~\/notes\/index\.md:41 — architecture/);
      // esc: closed, exactly where you were.
      await s.keys("escape");
      await s.notSee(PEEK_HINT);
      await opened(s, "index.md");
      s.expect(linkHere(s) === "../work/kestrel/docs/architecture.md", `on the link still: ${linkHere(s)}`);
      // z: the whole screen; again, most of it.
      await s.keys("enter");
      await s.see(title, 5000);
      const most = peekTitleAt(s, title);
      await s.keys("z");
      await s.see("z smaller");
      await s.until(() => peekTitleAt(s, title) < most, 3000, "the peek wider, its title further left");
      s.expect(peekTitleAt(s, title) <= 4, `filling the screen: its title at ${peekTitleAt(s, title)}`);
      await s.keys("z");
      await s.until(() => peekTitleAt(s, title) === most, 3000, "the peek as it was");
      // t: a tab here, read-only, marked with its vault's name; notes still the vault.
      await s.keys("t");
      await s.notSee(PEEK_HINT);
      await s.see("kestrel: architecture.md");
      await s.where(/^notes(?: │|$)/, /kestrel: docs\/architecture\.md/);
      await s.keys("i");
      await s.message("read-only here: kestrel's");
      // o: from the note's tab, peeked at again, gone into — kestrel's own tabs; ctrl+o, back in notes.
      await s.keys("g", "t");
      await opened(s, "index.md");
      await s.keys("enter");
      await s.see(title, 5000);
      await s.keys("o");
      await s.where(/^kestrel │ main\b/, /‹ docs\/architecture\.md/, 5000);
      // Indexed there: its backlinks, notes' among them, now in a peek from notes.
      await leader(s, "l", "b");
      await s.see("~/notes/index.md", 10000);
      await s.keys("escape");
      await s.keys("ctrl+o");
      await s.where(/^notes(?: │|$)/, /index\.md/, 5000);
      await follow(s, ARCHITECTURE);
      await s.see(title, 5000);
      // Worked out on their thread, they come under the note (#10): at its end, then at the list's once it's there.
      await s.keys("shift+g");
      await s.see(/Linked from \(\d+\):/, 10000);
      await s.keys("shift+g");
      await s.see(/~\/notes\/index\.md:41 — architecture/);
    },
  },
  {
    area: "links-and-files",
    name: "peek: links inside it — kestrel's own moves it, ctrl+o back inside it; notes' closes it and opens here; a third vault's moves it (VV-D7)",
    covers: { cases: ["links/travel", "links/roots"], commands: ["link.follow", "history.back"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      await follow(s, ARCHITECTURE);
      await s.see("kestrel › docs/architecture.md", 5000);
      // Its own vault's: the peek moves there; ctrl+o comes back inside the peek, notes untouched.
      await follow(s, "sync.md, if you work");
      await s.see("kestrel › docs/sync.md", 5000);
      await s.see("ctrl+o back");
      await s.keys("ctrl+o");
      await s.see("kestrel › docs/architecture.md", 5000);
      await s.where(/^notes(?: │|$)/);
      // This vault's: the peek closes, the note opens in the tabs, as usual.
      await follow(s, "sync-rewrite in his");
      await s.notSee(PEEK_HINT, 5000);
      await opened(s, "projects/sync-rewrite.md");
      await s.where(/^notes(?: │|$)/);
      // A third vault's, from product's PRD peeked at: the peek moves on, into kestrel.
      await s.restart({ startAt: "home/notes/meetings/2026-09-05-feedback-synthesis.md" });
      await follow(s, "the pricing section");
      await s.see("product › prd/route-sharing.md", 5000);
      await follow(s, "the feature doc");
      await s.see("kestrel › docs/features/route-sharing.md", 5000);
      await s.where(/^notes(?: │|$)/);
      await s.keys("ctrl+o");
      await s.see("product › prd/route-sharing.md", 5000);
    },
  },
  {
    area: "links-and-files",
    name: "peek: a backlink from another vault is read in a peek, this vault left as it was (VV-D7)",
    covers: { cases: ["links/backlinks", "vault"], commands: ["backlinks.open"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      // notes indexed whole, its index on disk for kestrel to read (17.11).
      await leader(s, "l", "b");
      await s.see("Linking to", 10000);
      await s.keys("escape");
      await s.restart({ startAt: "home/work/kestrel/docs/architecture.md" });
      await leader(s, "l", "b");
      await s.see("Linking to", 10000);
      await s.type("notes/index");
      await s.see("~/notes/index.md");
      await s.keys("enter");
      await s.see("notes › index.md", 5000);
      await s.see(PEEK_HINT);
      await s.where(/^kestrel │ main\b/, /‹ notes: index\.md/);
      await s.see("The architecture overview, by path"); // at the line linking here
    },
  },
  {
    area: "links-and-files",
    name: "peek: a click on a link into another vault peeks; ctrl+click goes there at once (VV-D7)",
    covers: { cases: ["mouse", "vault"], commands: ["link.go"] },
    run: async (s) => {
      /** A click on `needle` (SGR's reports, as a terminal sends them): `button` 16 is the left one with ctrl. */
      const click = async (needle: string, button = 0) => {
        const row = s.rowOf(needle);
        s.expect(row >= 0, `${needle} on screen to click`);
        const col = [...s.screen()[row]!].join("").indexOf(needle);
        const x = Bun.stringWidth(s.screen()[row]!.slice(0, col)) + 1;
        await s.send(`\x1b[<${button};${x};${row + 1}M`);
        await s.send(`\x1b[<${button};${x};${row + 1}m`);
      };
      // home's outreach/index.md: a vault of its own, nested in this one.
      await click("outreach — the public");
      await s.see("outreach › index.md", 5000);
      await s.see(PEEK_HINT);
      await s.keys("escape");
      await s.notSee(PEEK_HINT);
      await opened(s, "home.md");
      await sleep(600); // past a double-click
      await click("outreach — the public", 16);
      await s.message(" outreach — "); // as the switch says it: name — path
      await s.where(/^outreach(?: │|$)/, /index\.md/);
      s.expect(!s.text().includes(PEEK_HINT), "no peek on the way");
    },
  },
];
