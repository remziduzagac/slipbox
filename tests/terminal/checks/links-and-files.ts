// Links, roots and nested roots, vaults, converting links, rename, the trash, files, git (TT-T6) — and the note
// commands this area owns by their group (saving, exporting, the editor hand-off, info, trust), a short check each.

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  explorerOpen,
  type Check,
  downloadsElsewhere,
  explorerRow,
  follow,
  type LeftOut,
  leader,
  moveTo,
  open,
  opened,
  pos,
  problemListed,
} from "../check.ts";
import { loadTheme, type Role } from "../../../src/core/theme/index.ts";
import { type Session, sleep } from "../session.ts";

/** A role's foreground in a built-in theme, as the terminal reports it. */
const themeFg = (name: string, role: Role) => loadTheme(name, "/nonexistent").theme.roles[role].fg!.toLowerCase();

/** git in one of the reference set's repositories, as its owner runs it (HOME the set's); what it said. */
function git(s: Session, repo: string, ...args: string[]): { code: number; out: string } {
  const r = spawnSync(
    "git",
    ["-c", "user.email=sam@kestrel.dev", "-c", "user.name=Sam Rivera", "-C", s.path(repo), ...args],
    { encoding: "utf8", env: { ...process.env, HOME: s.home } },
  );
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

/** git run as a check expects it to end (`ok`: with 0, else not), git's own words in the failure when it doesn't. */
function gitOk(s: Session, what: string, ok: boolean, repo: string, ...args: string[]): void {
  const r = git(s, repo, ...args);
  if ((r.code === 0) === ok) return;
  const status = git(s, repo, "status", "--porcelain").out.trim();
  s.expect(false, `${what} (git ${args.join(" ")}: exit ${r.code})\n${r.out.trim()}\ngit status:\n${status}`);
}

/** What the explorer shows: each row left of its border, from under its breadcrumb down (empty when it's closed). */
function explorer(s: Session): string[] {
  const rows = s.screen();
  const title = rows.findIndex((r) => /Explorer/.test(r));
  if (title < 0) return [];
  const border = [...rows[title]!].findIndex((c) => c === "│" || c === "┃");
  return rows.slice(title + 2, -1).map((r) => [...r].slice(0, border).join(""));
}

/** The explorer's breadcrumb (VV-D5): its row under the title, left of its border ("" when it's closed). */
export function crumbs(s: Session): string {
  const rows = s.screen();
  const title = rows.findIndex((r) => /Explorer/.test(r));
  if (title < 0) return "";
  const border = [...rows[title]!].findIndex((c) => c === "│" || c === "┃");
  return [...rows[title + 1]!].slice(3, border).join("").trim(); // past the rail
}

/** A click on the breadcrumb's folder `name` (SGR's reports, as a terminal sends them). */
async function clickCrumb(s: Session, name: string): Promise<void> {
  const rows = s.screen();
  const row = rows.findIndex((r) => /Explorer/.test(r)) + 1;
  const at = new RegExp(`(^|\\s)${name}(\\s|$)`).exec(rows[row] ?? "");
  s.expect(row > 0 && !!at, `${name} in the breadcrumb to click: ${crumbs(s)}`);
  const col = at!.index + at![1]!.length;
  const x = Bun.stringWidth(rows[row]!.slice(0, col)) + 1;
  await s.send(`\x1b[<0;${x};${row + 1}M`);
  await s.send(`\x1b[<0;${x};${row + 1}m`);
}

/** The explorer has a row that ends with `name` (a folder's or a file's, after its icon and marks). */
export const listed = (s: Session, name: RegExp) => explorer(s).some((r) => names(r, name));

/** Whether an explorer row matches: its whole text, or what comes before a run of spaces — its name, the description
 *  and the marks at its right (VV-D9) left out. */
function names(row: string, name: RegExp): boolean {
  const t = row.trimEnd();
  if (name.test(t)) return true;
  for (const m of t.matchAll(/ {2,}/g)) if (name.test(t.slice(0, m.index))) return true;
  return false;
}

/** The explorer opened (space e toggles it, so up to three tries) with focus. */

/** Every file under a folder with its size: what "nothing written into it" compares. */
function tree(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(`${abs.slice(base.length)}/`, ...tree(abs, base));
    else out.push(`${abs.slice(base.length)} ${e.isFile() ? statSync(abs).size : "link"}`);
  }
  return out.sort();
}

/** How many messages say `needle`: the Messages window filtered by `words` first (it shows only its newest rows). */
async function messagesSaying(s: Session, words: string, needle: RegExp): Promise<number> {
  await leader(s, "m");
  await s.see("Messages");
  await s.type(words);
  // The list's own rows: each ends with its level and time. (The boxes floating at the top right say the newest
  // messages again, on the same rows, without either.)
  const said = new RegExp(`${needle.source}.*\\b(info|warn|error) \\d\\d:\\d\\d:\\d\\d`);
  const n = s.screen().filter((r) => said.test(r)).length;
  await s.keys("escape");
  return n;
}

/** The newest message holding `needle`, whole (the list cuts it, its box wraps it): the list filtered, enter copies. */
export async function lastMessage(s: Session, needle: string): Promise<string> {
  await leader(s, "m");
  await s.see("Messages");
  await s.type(needle);
  await s.keys("enter");
  await s.notSee("Messages");
  return s.clipboard();
}

/** The link under the cursor, as the status line names it (`→ path`). */
const linkHere = (s: Session) => /→ (\S+)/.exec(s.statusLine())?.[1] ?? "";

/**
 * From the top, tab from link to link until the one under the cursor is `target` (as the status line names it). Each
 * move is seen on the screen before the link is read: a note's place comes back at a start, the cursor maybe on this
 * very link, and a loaded machine's frame reaches the terminal after slipbox has drawn it — read before it lands, the
 * status line still names the link while the cursor is at the top, and `enter` sent then follows nothing.
 */
export async function toLink(s: Session, target: string | RegExp): Promise<void> {
  const is = () => (typeof target === "string" ? linkHere(s) === target : target.test(linkHere(s)));
  const at = () => `${pos(s).line}:${pos(s).col}`;
  const from = at();
  const sent = performance.now();
  await s.keys("g", "g");
  await s.settle(sent); // what slipbox wrote for it, arrived
  // Still on a link where it was: the top's frame not here yet (unless that was the top).
  if (linkHere(s) && from !== "1:1") await s.until(() => at() !== from, 3000, "g g to move the cursor to the top");
  for (let i = 0; i < 60 && !is(); i++) {
    const before = at();
    await s.keys("tab");
    await s.until(() => at() !== before, 3000, "tab to move the cursor to the next link");
  }
  await s.until(is, 1000, `the cursor on the link to ${target}`);
}

/** ~/notes/index.md's link into kestrel, as rendered. */
export const ARCHITECTURE = "architecture. The";

// The trees as they were before slipbox first opened them (setup runs at every start: taken once).
const before = new WeakMap<Session, Record<string, string[]>>();

const LINKS: Check[] = [
  {
    area: "links-and-files",
    name: "links: next and previous, follow, back and forward; alt+arrows move by word, not through history",
    covers: {
      cases: ["links"],
      commands: ["link.next", "link.prev", "link.follow", "history.back", "history.forward", "history.list"],
    },
    run: async (s) => {
      // tab and shift+tab: from link to link; enter follows the one under the cursor.
      await s.keys("tab", "tab", "shift+tab");
      await s.until(() => linkHere(s) === "about-this-vault.md", 3000, "tab, tab, shift+tab: back on the first link");
      await s.keys("enter");
      await opened(s, "about-this-vault.md");
      await s.keys("ctrl+o"); // back
      await opened(s, "home.md");
      await leader(s, "h", "n"); // forward
      await opened(s, "about-this-vault.md");
      await leader(s, "h", "p");
      await opened(s, "home.md");
      await leader(s, "h", "h");
      await s.see("History");
      await s.keys("escape");
      // alt+right and alt+left (a Mac's option+arrows), and alt+f and alt+b (what its terminals send for them): a
      // word forward and back, on the same note — history is ctrl+o and space h.
      await s.keys("g", "g");
      const at = pos(s);
      await moveTo(s, ["alt+right"], (l, c) => l === at.line && c > at.col, "alt+right: a word on");
      const word = pos(s).col;
      await moveTo(s, ["alt+f"], (l, c) => l === at.line && c > word, "alt+f: another word on");
      await moveTo(s, ["alt+b"], (l, c) => l === at.line && c === word, "alt+b: a word back");
      await moveTo(s, ["alt+left"], (l, c) => l === at.line && c === at.col, "alt+left: back to the start");
      await opened(s, "home.md");
      // space l n and space l p: the next link and back; space l f follows it.
      await s.keys("tab");
      await s.until(() => linkHere(s) !== "", 3000, "the cursor on a link");
      const first = linkHere(s);
      await leader(s, "l", "n");
      await s.until(() => linkHere(s) !== "" && linkHere(s) !== first, 3000, "space l n onto the next link");
      await leader(s, "l", "p");
      await s.until(() => linkHere(s) === first, 3000, "space l p back onto the first");
      await leader(s, "l", "f");
      await opened(s, first);
    },
  },
  {
    area: "links-and-files",
    name: "links: the lists — this note's links and its backlinks; enter goes to one",
    covers: { cases: ["links", "links/backlinks"], commands: ["links.open", "backlinks.open"] },
    options: { open: "people/kenji-mori.md" },
    run: async (s) => {
      await leader(s, "l", "l");
      await s.see("Links from");
      await s.keys("escape");
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.see("partners-and-names.md");
      await s.type("partners");
      await s.keys("enter");
      await opened(s, "people/partners-and-names.md");
    },
  },
  {
    area: "links-and-files",
    name: "links: followed into a split, and into a tab of its own — a data file beside a note, by its extension",
    covers: { cases: ["links", "multiple-roots"], commands: ["link.follow_split", "link.follow_tab"] },
    run: async (s) => {
      await s.keys("tab");
      await leader(s, "l", "s");
      await s.until(() => s.text().split("§ ").length - 1 === 2, 3000, "the link open in a split");
      // The split has focus: only it is left.
      await s.keys("ctrl+w", "o");
      await opened(s, "about-this-vault.md");
      // ctrl+enter: a tab of its own, as a browser's ctrl+click; the tabs name each file with its extension.
      await open(s, "pipeline-cookbook");
      await toLink(s, "halley/halley.toml");
      await s.keys("ctrl+enter");
      await opened(s, "software/halley/halley.toml");
      await s.see(/ 1 pipeline-cookbook\.md × │ 2 halley\.toml × │/);
    },
  },
  {
    area: "links-and-files",
    name: "links: a picture followed, linked or embedded — its path copied, said so, no later phase promised (A17)",
    covers: { cases: ["links/forms"], commands: ["link.follow"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      const SAID = "attachment attachments/whiteboard-2026-08-26.png — path copied";
      await follow(s, "whiteboard from the design review");
      await s.message("attachment attachments/whiteboard-2026-08-26.png");
      await s.until(
        () => s.clipboard().endsWith("/notes/attachments/whiteboard-2026-08-26.png"),
        3000,
        "the picture's path copied",
      );
      await opened(s, "index.md");
      // The message whole: nothing after "path copied" (it promised pictures "in a later phase").
      const said = await lastMessage(s, "attachment");
      s.expect(said === SAID, `the message: ${said}`);
      // Embedded, in the design review's note: the same (the first box gone, so it's the embed's that says it).
      await s.notSee("attachment attachments/whiteboard-2026-08-26.png", 8000);
      await open(s, "2026-08-26-route-sharing-design-review");
      await follow(s, "Whiteboard with three");
      await s.message("attachment attachments/whiteboard-2026-08-26.png");
      await opened(s, "meetings/2026-08-26-route-sharing-design-review.md");
      const again = await lastMessage(s, "attachment");
      s.expect(again === SAID, `the embed's message: ${again}`);
    },
  },
  {
    area: "links-and-files",
    name: "links: zk's links without an extension followed; a rename keeps them so (21.2)",
    covers: { cases: ["links/conventions", "rename"], commands: ["note.rename", "history.back"] },
    options: { home: true, startAt: "home/hobbies/cycling/202608151900-index.md" },
    run: async (s) => {
      // `[300 km brevet](rides/202609131900-300k-brevet)`: the note with `.md`, as zk means it.
      await follow(s, "300 km brevet");
      await opened(s, "rides/202609131900-300k-brevet.md");
      // Renamed here: the index's link follows it, still without its extension.
      await leader(s, "n", "m");
      await s.see("rename or move");
      await s.keys("ctrl+u");
      await s.type("rides/202609131900-brevet-300k");
      await s.keys("enter");
      await s.see(/→ rides\/202609131900-brevet-300k\.md: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.file(
        "~/hobbies/cycling/202608151900-index.md",
        (t) => t.includes("[300 km brevet](rides/202609131900-brevet-300k)"),
        "the link renamed, no extension",
      );
      s.expect(
        !s.read("~/hobbies/cycling/202608151900-index.md").includes("202609131900-300k-brevet"),
        "no link left to the old name",
      );
      // Back on the index, the renamed link is followed as before.
      await s.keys("ctrl+o");
      await opened(s, "202608151900-index.md");
      await follow(s, "300 km brevet");
      await opened(s, "rides/202609131900-brevet-300k.md");
    },
  },
  {
    area: "links-and-files",
    name: "links: / from the nearest root — a repository's, a root nested in it; a folder link revealed; --root starts there (21.2)",
    covers: { cases: ["links/forms", "links/roots"] },
    options: { home: true, startAt: "home/work/product/README.md" },
    run: async (s) => {
      // The repository's root: `/prd/route-sharing.md` from product's top.
      await follow(s, "route sharing");
      await opened(s, "prd/route-sharing.md");
      // The handbook is a vault of its own inside the repository: its `/glossary.md` is its own.
      await s.restart({ startAt: "home/work/product/handbook/how-we-write.md" });
      await s.status(/handbook.*how-we-write\.md/);
      await follow(s, "the glossary");
      await s.status(/handbook/);
      await opened(s, "glossary.md");
      // Started with --root at the repository, a note of the handbook is still the handbook's.
      await s.restart({
        args: ["--root", `${s.home}/work/product`],
        startAt: "home/work/product/handbook/how-we-write.md",
      });
      await s.status(/handbook.*how-we-write\.md/);
      // A link to a folder: the explorer, there, the folder unfolded.
      await s.restart({ args: [], startAt: "home/notes/research/link-styles.md" });
      await follow(s, "the projects");
      await s.status("FILES");
      await s.until(
        () => {
          const rows = s.screen();
          const at = rows.findIndex((r) => /\bprojects\b/.test(r) && !/the projects/.test(r));
          return at >= 0 && rows.slice(at + 1, at + 12).some((r) => r.includes("kestrel-v2-3.md"));
        },
        3000,
        "projects/ unfolded in the explorer, its notes under it",
      );
    },
  },
  {
    area: "links-and-files",
    name: "links: one target by every form — relative, from the root, without .md, from ~, by pointer and old name, a wikilink, a block",
    covers: {
      cases: ["links/forms", "links/fragments", "links/misc", "links/named-folders"],
      commands: ["link.follow"],
    },
    options: { home: true, startAt: "home/notes/research/link-styles.md" },
    run: async (s) => {
      // "The same target by every form": each reaches projects/kestrel-v2-3.md, the block one at its paragraph.
      for (const [text, more] of [
        ["relative, the form", null],
        ["root, the GitHub way: from", null],
        ["zk writes it: extensionless", null],
        ["home folder: home-relative", null],
        ["folder's name: pointer", null],
        ["before August: old name", null],
        ["A wikilink: kestrel-v2-3", null],
        ["id: the decision", /L(?!1:)\d+:/],
      ] as const) {
        await s.keys("g", "g");
        await follow(s, text);
        await opened(s, "projects/kestrel-v2-3.md");
        if (more) await s.status(more);
        await s.keys("ctrl+o");
        await opened(s, "research/link-styles.md");
      }
      // A file URL is followed, not copied as a URL: the file it names read in a peek, Elsewhere's (VV-D7, VV-D3).
      await toLink(s, "file:///etc/hosts");
      await s.keys("enter");
      await s.see("Elsewhere › /etc/hosts", 5000);
      await s.status(/ ‹ \S*\/etc\/hosts › /);
      await s.keys("escape");
      await opened(s, "research/link-styles.md");
      // The same, broken: a note that isn't there is offered to be made, its name filled in; esc, nothing written.
      await toLink(s, "../projects/kestrel-v2-33.md");
      await s.keys("enter");
      await s.see("new note in projects/");
      await s.see("› kestrel-v2-33");
      await s.keys("escape");
      await opened(s, "research/link-styles.md");
      s.expect(!s.exists("~/notes/projects/kestrel-v2-33.md"), "nothing made");
      // In source mode, each written as the file has it.
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.see("[from the root](/projects/kestrel-v2-3.md)");
      await s.see("[[kestrel-v2-3]]");
    },
  },
  {
    area: "links-and-files",
    name: "links: in data and code files — a config's include and $schema followed, a broken one said; a note's link into a code line and a data table",
    covers: { cases: ["links-data", "mixed-roots", "fragments"], commands: ["link.follow"] },
    options: { home: true, startAt: "home/work/kestrel/config/app.toml" },
    run: async (s) => {
      // A reference key is a link even when it reaches nothing: said so.
      await toLink(s, "./missing-schema.json");
      await s.keys("enter");
      await s.message("broken link");
      await opened(s, "config/app.toml");
      // The chain kestrel.toml → app.toml → base.yaml → schema.json, followed by its values.
      await toLink(s, /^(\.\/)?base\.yaml$/);
      await s.keys("enter");
      await opened(s, "config/base.yaml");
      await toLink(s, /^(\.\/)?schema\.json$/);
      await s.keys("enter");
      await opened(s, "config/schema.json");
      // A value that only looks like a path, reaching nothing, is no link at all.
      await s.keys("ctrl+o");
      await opened(s, "config/base.yaml");
      await s.keys("g", "g");
      for (let i = 0; i < 12; i++) {
        await s.keys("tab");
        s.expect(!linkHere(s).includes("missing.yaml"), "./missing.yaml isn't a link");
      }
      // From a note, into a code file's line and a data file's table: each at its place.
      await s.restart({ startAt: "home/notes/projects/sync-rewrite.md" });
      await toLink(s, "../../work/kestrel/config/app.toml#sync");
      await s.keys("enter");
      await opened(s, "config/app.toml");
      await s.status(/L11:/);
      await s.restart({ startAt: "home/notes/daily/2026-09-22.md" });
      await follow(s, "sync.py line 94");
      await opened(s, "api/kestrel_api/sync.py");
      await s.status(/L94:/);
    },
  },
  {
    area: "links-and-files",
    name: "links: an Obsidian vault's wikilinks, read within it — names, aliases, headings, blocks, ties; no root, no names (21.3)",
    covers: { cases: ["links/wikilinks", "links/fragments"] },
    options: { home: true, startAt: "home/hobbies/cooking/Home.md" },
    run: async (s) => {
      // Pictures by name, as Obsidian sizes them (`|300`, `|240x180`): shown by their names.
      await s.see("maqluba-flip.jpg");
      s.expect(!s.screen().some((r) => /\b(300|240x180)$/.test(r.trimEnd())), "a picture's size isn't its text");
      // `[[Meal plan|this week]]`: by its name, shown by its alias (the heading's words come first).
      await follow(s, "this week. Monday");
      await opened(s, "Meal plan.md");
      await s.keys("ctrl+o");
      await opened(s, "Home.md");
      // `[[Maqluba]]`: no note by that name; مقلوبة.md's front matter has it as an alias, said so.
      await follow(s, "Maqluba when");
      await s.message(/\[\[Maqluba\]\] reached Recipes\/Family/); // "…by an alias", wrapped on
      await s.see("Malik's family maqluba");
      await s.keys("ctrl+o");
      await opened(s, "Home.md");
      // `[[Notes]]`: two notes of that name — the one in the same folder.
      await follow(s, "Notes: the one");
      await opened(s, "Notes.md");
      s.expect(!/Recipes/.test(s.statusLine()), "the same folder's Notes.md, not Recipes/'s");
      await s.keys("ctrl+o");
      await opened(s, "Home.md");
      // `![[dal.png|300]]`: two pictures of that name — the shorter path's, as Obsidian picks; its path copied.
      await follow(s, "dal.png");
      await s.message("attachment attachments/dal.png");
      s.expect(
        s.clipboard().endsWith("/cooking/attachments/dal.png"),
        "attachments/dal.png's path copied, not Archive's",
      );
      // A third, in a new folder as near as attachments/, put there while slipbox runs: a real tie, asked which.
      s.write("~/hobbies/cooking/photos/dal.png", "png");
      for (let i = 0; i < 20 && !s.screen().some((r) => r.includes("[[dal.png]] matches 3 files")); i++) {
        await s.keys("enter"); // the link under the cursor, followed again once the watcher has the new file
        await s.settle(undefined, 300);
      }
      await s.see("[[dal.png]] matches 3 files");
      await s.see("photos/dal.png");
      await s.keys("escape");
      // `[[Home#Pantry]]` from deep in Recipes: the heading, by its name.
      await s.restart({ startAt: "home/hobbies/cooking/Recipes/Baking/Sourdough/Starter/Feeding log.md" });
      await follow(s, "Home › Pantry");
      await opened(s, "Home.md");
      await s.status(/L36:/);
      // `[[Dal#^tadka]]`: the step its ^id closes.
      await s.restart({ startAt: "home/hobbies/cooking/Recipes/Weeknight/Dal.md" });
      await follow(s, "Dal ^tadka");
      await s.status(/L3[23]:/);
      // In Elsewhere (Downloads, copied beside home): a name finds nothing, and says why — no vault to look in.
      await s.restart({ startAt: "elsewhere/stray-note.md", setup: downloadsElsewhere });
      await s.see("See plan for the order of work");
      await follow(s, "plan for the order");
      await s.message(/\[\[plan\]\]: a wikilink is read within a vault/);
    },
  },
  {
    area: "links-and-files",
    name: "links: each root's convention and what said it — Obsidian's, zk's, a folder's own; yours, saved while running (21.4)",
    covers: { cases: ["links/conventions", "links/state"], commands: ["note.info"] },
    options: { home: true, startAt: "home/hobbies/cooking/Home.md" },
    run: async (s) => {
      // The cooking vault's, in the Info view: Obsidian's settings say all three.
      await leader(s, "n", "i");
      await s.see(/writes +wikilinks/);
      await s.see(/path +by name/);
      await s.see(/\.md +dropped/);
      await s.see(/from +Obsidian/);
      // zk's notebook, and the design folder whose own config says markdown over Obsidian's wikilinks, as an agent asks.
      const zk = s.cliIn("~/hobbies/cycling", "info");
      s.expect(
        zk.out.includes("links     markdown links, relative, without .md — zk's .zk/config.toml"),
        `zk's convention, from info:\n${zk.out}`,
      );
      const design = JSON.parse(s.cliIn("~/work/product/design", "info", "--json").out).data.links;
      s.expect(
        design.style.value === "markdown" &&
          design.style.why === "[links] in .slipbox/config.toml" &&
          design.extension.why === "Obsidian's .obsidian/app.json",
        `the design folder's: ${JSON.stringify(design)}`,
      );
      // Your own setting, saved while slipbox runs: taken at once, over Obsidian's — a markdown link is a path.
      const config = `${s.dir}/config/slipbox/config.toml`;
      s.write(config, `${s.read(config)}\n[links]\nstyle = "markdown"\n`);
      await s.see(/writes +markdown \(setting\)/, 6000);
      await s.see(/path +relative \(ours\)/);
      await s.see(/\.md +kept \(Obsidian\)/);
      await s.notSee(/writes +wikilinks/);
    },
  },
  {
    area: "links-and-files",
    name: "links: written as each root writes them — the picker, [[ completed, slipbox link for an agent (21.5)",
    covers: { cases: ["links/conventions", "links"], commands: ["link.insert", "view.source", "note.save"] },
    options: { home: true, startAt: "home/hobbies/cooking/Home.md" },
    run: async (s) => {
      // The picker, reading: after the word under the cursor, a wikilink by name — Obsidian's way.
      await s.keys("/");
      await s.type("shelves in");
      await s.keys("enter", "escape");
      await leader(s, "l", "i");
      await s.see("Link to…");
      await s.type("Shaksh");
      await s.keys("enter");
      await s.file(
        "~/hobbies/cooking/Home.md",
        (t) => t.includes("More on the shelves [[Shakshuka]] in [[Pantry]]."),
        "the picked link after the word, by name",
      );
      await s.message("linked Recipes/Weeknight/Shakshuka.md");
      // [[ completed in source mode: the other Notes, by its path — the name is this folder's own.
      await leader(s, "n", "v");
      await s.keys("shift+g", "o");
      for (const k of ["[", "[", ..."Recipes/No"]) await s.keys(k);
      await s.see(/Recipes\/Notes +Recipes\/Notes\.md/);
      await s.keys("tab", "]", "]", "escape", "ctrl+s");
      await s.file(
        "~/hobbies/cooking/Home.md",
        (t) => t.trimEnd().endsWith("[[Recipes/Notes]]"),
        "the completed wikilink, by its path",
      );
      // An agent asks how to link from zk's notebook: no extension, from the note.
      const zk = s.cliIn(
        "~/hobbies/cycling",
        "link",
        "gear/202608201000-bike-fit.md",
        "--from",
        "rides/202609131900-300k-brevet.md",
      );
      s.expect(zk.out === "[Bike fit](../gear/202608201000-bike-fit)\n", `zk's link: ${zk.out}`);
    },
  },
  {
    area: "links-and-files",
    name: "links: a target's completion kept while it's typed — hidden past a match, keys as with no popup, back on a backspace; an indent keeps it (20.13)",
    covers: { cases: ["links"], commands: ["view.source"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      const inbox = /inbox\.md +~\/notes\/inbox\.md/;
      await leader(s, "n", "v");
      await s.keys("shift+g", "o");
      // A markdown link's target: the list as it's typed.
      for (const k of "[x](inb") await s.keys(k);
      await s.see(inbox);
      // Past any match it shows nothing, and tab is the editor's again: the line indented.
      await s.keys("z", "z");
      await s.notSee(inbox);
      const before = pos(s).col;
      await s.keys("tab");
      await s.until(() => pos(s).col > before, 3000, "the line indented");
      // Back to a match: the list again, its target moved by the indent.
      await s.keys("backspace", "backspace");
      await s.see(inbox);
      // A wikilink's the same; its target ended, it closes.
      await s.keys("escape", "o");
      for (const k of "[[inb") await s.keys(k);
      const wiki = /inbox +inbox\.md/;
      await s.see(wiki);
      await s.keys("q", "q");
      await s.notSee(wiki);
      await s.keys("backspace", "backspace");
      await s.see(wiki);
      await s.keys("]");
      await s.notSee(wiki);
    },
  },
  {
    area: "links-and-files",
    name: "links: a target's completion narrowed key by key — among the last key's matches, back on a backspace, a capital past a match, more matches than shown (20.13)",
    covers: { cases: ["links"], commands: ["view.source"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      // More notes matching `t` than a list shows, and one that ranks after them all: made here, the one exception to
      // the samples in these checks, as the reference set holds fewer files than a list shows.
      setup: (s) => {
        for (let i = 0; i < 600; i++) s.write(`~/notes/tt/t${String(i).padStart(3, "0")}.md`, "# T\n");
        s.write("~/notes/tt/tquokka.md", "# Quokka\n");
      },
    },
    run: async (s) => {
      const inbox = /inbox\.md +~\/notes\/inbox\.md/;
      const interviews = /research\/user-interviews-2026-08\.md +~\/notes\/research/;
      await leader(s, "n", "v");
      await s.keys("shift+g", "o");
      // `in`, a long list; `inbox`, inbox alone; back to `in`, the long list again.
      for (const k of "[x](in") await s.keys(k);
      await s.see(inbox);
      await s.see(interviews);
      for (const k of "box") await s.keys(k);
      await s.see(inbox);
      await s.notSee(interviews);
      await s.keys("backspace", "backspace", "backspace");
      await s.see(interviews);
      // A capital matches as typed: past a match nothing, and back.
      await s.keys("escape", "o");
      for (const k of "[x](SKILL") await s.keys(k);
      // The popup cuts a long path short.
      const skill = "research/agent-skills/draft-checklist/S";
      await s.see(skill);
      await s.keys("z", "Z");
      await s.notSee(skill);
      await s.keys("backspace", "backspace");
      await s.see(skill);
      // More match `t` than are shown, tquokka not among them: `q` finds it among every match of `t`.
      await s.keys("escape", "o");
      for (const k of "[[tq") await s.keys(k);
      await s.see(/tquokka +tt\/tquokka\.md/);
    },
  },
  {
    area: "links-and-files",
    name: "links: each target its own completion — another line's, another on the same line, after a paste, the next link's: a vault indexed since offered (20.13)",
    covers: { cases: ["links"], commands: ["view.source"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      // A vault of the set indexed while a list is kept: its notes offered only by a list made since.
      const indexed = (vault: string) => {
        const r = s.cliIn(vault, "index", "--refresh");
        s.expect(r.code === 0, `${vault} indexed: ${r.out}`);
      };
      await leader(s, "n", "v");
      await s.keys("shift+g", "o");
      // Another line's target, the cursor gone there from a list kept: its own list, made then.
      for (const k of "[b](shaksh") await s.keys(k);
      await s.keys("escape", "o");
      for (const k of "[a](zzzzzz") await s.keys(k);
      indexed("~/hobbies/cooking");
      await s.keys("up");
      await s.see("~/hobbies/cooking/Recipes/Weeknight/");
      // Another target on the same line, the cursor gone there at a jump: likewise.
      await s.keys("escape", "o");
      for (const k of "[d](bike-fit") await s.keys(k);
      await s.keys("home");
      for (const k of "[c](zz") await s.keys(k);
      indexed("~/hobbies/cycling");
      await s.keys("end");
      await s.see("~/hobbies/cycling/gear/");
      // A paste that leaves the cursor in another target on the line, then a key there: likewise.
      await s.keys("escape", "o");
      for (const k of "[f](zz") await s.keys(k);
      indexed("~/work/product/design");
      await s.paste(") [g](share");
      await s.keys("left");
      await s.see("~/work/product/design/share-flow.md");
      // The link ended, the next one's list made anew.
      await s.keys("escape", "o");
      indexed("~/work/product/handbook");
      for (const k of "[e](glossary") await s.keys(k);
      await s.see("~/work/product/handbook/glossary.md");
    },
  },
  {
    area: "links-and-files",
    name: "links: another vault's note completed as its pointer — each folder by its name, a name two share asked first, a private one said; slipbox link the same (20.13, 21.7)",
    covers: { cases: ["links", "links/conventions", "links/named-folders"], commands: ["view.source", "note.save"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      setup: (s) => {
        // The cooking folder named as the product handbook is: a name two different folders share.
        s.cliIn("~/hobbies/cooking", "init", ".", "--name", "handbook");
        // Cycling named privately: its .slipbox/ kept out of the git it's given here.
        git(s, "~/hobbies/cycling", "init", "-q");
        s.cliIn("~/hobbies/cycling", "init", ".", "--name", "rides", "--private");
        for (const v of ["~/hobbies/photography", "~/work/product/handbook", "~/hobbies/cooking", "~/hobbies/cycling"])
          s.cliIn(v, "index", "--refresh");
      },
    },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.keys("shift+g", "o");
      for (const k of "[x](photography/index") await s.keys(k);
      await s.see("~/hobbies/photography/index.md");
      await s.keys("tab", ")", "space");
      // A name two folders share: asked how it's written, then written as it is.
      for (const k of "[y](handbook/glossary") await s.keys(k);
      await s.see("~/work/product/handbook/glossary.md");
      await s.keys("tab");
      await s.see("handbook: 2 different folders have this name");
      await s.keys("enter");
      await s.see("[y](slipbox://handbook/glossary.md");
      await s.keys(")", "space");
      // A private name: written, and said to work on this machine only.
      for (const k of "[z](cycling/gear/2026082") await s.keys(k);
      await s.see("~/hobbies/cycling/gear/");
      await s.keys("tab");
      await s.message(/rides is a private name/);
      await s.keys(")", "escape", "ctrl+s");
      await s.file(
        "~/notes/index.md",
        (t) =>
          t.includes(
            "[x](slipbox://photography/index.md) [y](slipbox://handbook/glossary.md) [z](slipbox://rides/gear/202608201000-bike-fit.md)",
          ),
        "each folder's note by its pointer",
      );
      // An agent asks the same of the command line.
      const r = s.cliIn("~/notes", "link", s.path("~/hobbies/photography/index.md"), "--from", "index.md");
      s.expect(r.out.includes("slipbox://photography/index.md"), `slipbox link: ${r.out}`);
    },
  },
];

const ROOTS: Check[] = [
  {
    area: "links-and-files",
    name: "roots: a path into another root peeks, o goes into it, and back; a broken one said; a backlink from it, by its path (17.x, 21.9)",
    covers: { cases: ["links/travel", "links/backlinks", "links/forms", "vault"], commands: ["backlinks.open"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      // This note's backlinks listed: notes is indexed whole, its index on disk for other roots to read (17.11).
      await leader(s, "l", "b");
      await s.see("Linking to", 10000);
      await s.keys("escape");
      // ../work/kestrel/docs/architecture.md: a peek; o, into kestrel, at its own path; back, at the link.
      await follow(s, ARCHITECTURE);
      await s.see(PEEK_HINT, 5000);
      await s.keys("o");
      await s.message(/kestrel — /);
      await s.status(/kestrel · main +‹ docs\/architecture\.md/, 5000);
      await s.keys("ctrl+o");
      await s.status(/ notes .*index\.md/, 5000);
      // A pointer to a name this machine has never seen: said so, nothing opened.
      await follow(s, "the secret project");
      await s.message("isn't on this machine yet");
      await opened(s, "index.md");
      // architecture.md's backlinks: notes' index among them, by its path from home (21.9).
      await follow(s, ARCHITECTURE);
      await s.see(PEEK_HINT, 5000);
      await s.keys("o");
      await s.status(/kestrel · main +‹ docs\/architecture\.md/, 5000);
      await leader(s, "l", "b");
      await s.see("Linking to", 10000);
      await s.type("notes/index");
      await s.see("~/notes/index.md");
    },
  },
  {
    area: "links-and-files",
    name: "nested roots: the demo's outreach — peeked at by path, o in, back, backlinks, two deep",
    covers: { cases: ["vault", "links/roots", "links/backlinks"], commands: ["backlinks.open"] },
    run: async (s) => {
      // home's last link: outreach/index.md, in a root nested in this one (enter: the row's link) — a vault of its
      // own, so a peek (VV-D7); o goes into it.
      await s.keys("shift+g", "enter");
      await s.see("outreach › index.md", 5000);
      await s.keys("o");
      await s.message(" outreach — "); // as the switch says it: name — path
      await s.status("index.md");
      await s.see("The observatory's public programme");
      // Two deep: the school visits.
      await s.keys("g", "g", "tab", "tab", "enter");
      await s.see("outreach-school-visits › index.md", 5000);
      await s.keys("o");
      await s.message(" outreach-school-visits — ");
      await s.see("A vault nested two deep");
      // Back, and back again: to the observatory's home.
      await s.keys("ctrl+o");
      await s.status("index.md");
      await s.keys("ctrl+o");
      await s.status("home.md");
      await s.see("Halden Ridge Observatory");
      // home's backlinks: from both nested roots, each by its path (21.9).
      await leader(s, "l", "b");
      await s.see("outreach/index.md");
      await s.see("outreach/school-visits/index.md");
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "nested roots: the explorer's row — its name asked by shift+r; m moves its folder, its links out following, two deep too",
    covers: { cases: ["vault", "links/moves"] },
    run: async (s) => {
      await explorerOpen(s);
      await s.see("outreach");
      await explorerRow(s, "outreach");
      await s.keys("shift+r");
      await s.see("name outreach, as pointers name it:");
      await s.keys("escape");
      // m: its folder moved, picked from the tree by typing — its links out (two deep too) follow, its name stays.
      await s.keys("m");
      await s.see("Move outreach/ to…");
      await s.see("(the vault's top)");
      await s.type("handbo");
      await s.keys("enter");
      await s.see(/outreach\/ → handbook\/outreach\//);
      await s.keys("enter");
      await s.file(
        "handbook/outreach/index.md",
        (t) => t.includes("[the operations handbook](../operations-handbook.md)"),
        "outreach's link out fixed",
      );
      s.expect(
        s.read("handbook/outreach/school-visits/index.md").includes("(../../safety-card.adoc)"),
        "two deep: fixed too",
      );
      s.expect(s.read("home.md").includes("[outreach](handbook/outreach/index.md)"), "home's path into it follows");
    },
  },
  {
    area: "links-and-files",
    name: "vaults: v makes a folder a root after a preview, paths across untouched; V makes it a plain folder again",
    covers: { cases: ["vault", "links/state"] },
    run: async (s) => {
      const home = s.read("home.md");
      await explorerOpen(s);
      await explorerRow(s, "logs");
      // Its menu has it; v does it: the name asked, a distinct one offered.
      await s.keys(".");
      await s.see(/Give it \.slipbox\/ +v/);
      await s.keys("v");
      await s.see("give logs/ its .slipbox/, called (empty: no name):");
      await s.see("› halden-logs");
      await s.keys("enter");
      await s.see(/logs\/ → a vault of its own, called halden-logs: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("made logs/ a vault of its own, called"); // the box wraps the rest
      s.expect(s.exists("logs/.slipbox/config.toml"), "logs/ has its .slipbox/");
      s.expect(s.read("home.md") === home, "home's path into it, across now, as it was");
      // V: back, the links as they were.
      await s.keys("shift+v");
      await s.see(/logs\/ → part of halden: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("made logs/ part of halden");
      s.expect(!s.exists("logs/.slipbox"), "its .slipbox/ gone (to the trash)");
      await s.file("home.md", (t) => t === home, "home as it was");
      // From anywhere too: which-key lists them under space d (folders) and space v (vaults).
      await s.keys("escape");
      await leader(s, "d");
      await s.see("Rename the folder");
      await s.keys("escape");
      await leader(s, "v");
      await s.see("Give a folder .slipbox/");
      await s.see("Take .slipbox/ away");
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "vaults: a git repository is a root by itself — opened from its top, nothing asked or written; its links followed",
    covers: { cases: ["vault", "links/roots", "links/conventions"] },
    options: {
      home: true,
      startAt: "home/work/infra/README.md",
      setup: (s) => {
        if (!before.has(s)) before.set(s, { infra: tree(s.path("~/work/infra")) });
      },
    },
    run: async (s) => {
      // The repository's top is the root (20.3): named by its remote, the note by its path in it.
      await s.status(/ infra[ ·].*README\.md/);
      s.expect(!s.text().includes("make it a vault?"), "nothing offered");
      // Its links followed within it.
      await toLink(s, "k8s/api.yaml");
      await s.keys("enter");
      await opened(s, "k8s/api.yaml");
      await s.status(/ infra[ ·]/);
      await s.quit();
      s.expect(!s.exists("~/work/infra/.slipbox"), "no .slipbox/ made in the repository");
      s.expect(
        JSON.stringify(tree(s.path("~/work/infra"))) === JSON.stringify(before.get(s)!.infra),
        "the repository as it was",
      );
    },
  },
  {
    area: "links-and-files",
    name: "roots: a named folder moved by hand brings its reading places along, nothing asked (21.8)",
    covers: { cases: ["vault", "links/state", "links/named-folders"] },
    options: { home: true, startAt: "home/hobbies/photography/index.md" },
    run: async (s) => {
      // Read to the end of a note, then quit: the place is kept, by file.
      await moveTo(s, ["shift+g"], (l) => l > 10, "the end of the note");
      const left = pos(s).line;
      await s.quit();
      // Moved by hand, then opened where it is now: photography, by its .slipbox/ id, its state along.
      renameSync(s.path("~/hobbies/photography"), s.path("~/hobbies/photography-moved"));
      await s.restart({ startAt: "home/hobbies/photography-moved/index.md" });
      await s.message("photography moved here from", 5000); // the box wraps where from
      await s.notSee("did it move here?");
      await s.until(() => pos(s).line === left, 5000, `index.md at line ${left} again`);
    },
  },
  {
    area: "links-and-files",
    name: "vaults: Elsewhere — a folder outside home and every vault opens in no-vault, its tabs its own, no index and said so; going into a vault brings its tabs",
    covers: {
      cases: ["vault", "links/roots", "links/state", "links/backlinks"],
      commands: ["search.open", "backlinks.open", "folders.open"],
    },
    options: {
      home: true,
      startAt: "elsewhere",
      setup: (s) => {
        // Beside home, not in it (home is a vault): a few of Downloads' files.
        const at = join(s.dir, "elsewhere");
        cpSync(s.path("~/Downloads/old-blog-export"), join(at, "old-blog-export"), { recursive: true });
        cpSync(s.path("~/Downloads/stray-note.md"), join(at, "stray-note.md"));
        s.cliIn("~/notes", "ls"); // notes: known to this machine
      },
    },
    run: async (s) => {
      await s.status(/ Elsewhere\b/);
      await s.see("stray-note.md");
      await s.see("old-blog-export");
      // No list of the named folders over it at the start: its folder, the breadcrumb above it.
      s.expect(s.rowOf(/Folders \(\d+\)/) < 0, "no named folders' list at the start");
      await s.until(() => / elsewhere ›$/.test(crumbs(s)), 3000, "the breadcrumb: … › elsewhere ›");
      // A note of its own: no backlinks, and why — never an empty list.
      await explorerOpen(s);
      await explorerRow(s, "stray-note.md");
      await s.keys("enter");
      await s.status(/ Elsewhere .*stray-note\.md/);
      await leader(s, "l", "b");
      await s.message("no backlinks in Elsewhere: it has no index");
      // No search across it.
      await leader(s, "f", "s");
      await s.message("Elsewhere has no index to search");
      // Into a vault: its own tabs; back with ctrl+o: Elsewhere's, the note where it was.
      await leader(s, "v", "v");
      await s.see(/Folders \(\d+\)/);
      await s.type("notes");
      await s.keys("enter");
      await s.message(" notes — ");
      await s.status(/ notes[ ·]/);
      await s.keys("ctrl+o");
      await s.status(/ Elsewhere .*stray-note\.md/, 5000);
    },
  },
  {
    area: "links-and-files",
    name: "vaults: home — started in ~, home is the vault: a note of its own has its backlinks once home is walked, while nobody works; the vaults in it their own",
    covers: {
      cases: ["vault", "links/roots", "links/travel", "links/backlinks", "info"],
      commands: ["note.info", "backlinks.open"],
    },
    options: {
      home: true,
      startAt: "home",
      // The background index on, as by default, and soon at work: home's walk and index first (VV-D2).
      config: "[index]\nidle_seconds = 1\n",
      // A named folder this machine has seen: no list of them to go into first — home is a vault.
      setup: (s) => {
        s.cliIn("~/notes", "ls");
      },
    },
    run: async (s) => {
      await s.status(/ ~ /); // home, by its path
      s.expect(s.rowOf(/Folders \(\d+\)/) < 0, "home is a vault: no named folders to go into first");
      // A note of its own, at its top; its backlink lies below it, found once home is walked.
      await open(s, "todo.md");
      await leader(s, "n", "i");
      await s.status("INFO");
      await s.see(/vault +home \(~\)/);
      await s.see(/backlinks +1\b/, 20000);
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.see("household/bike-insurance.md");
      await s.keys("escape");
      // Its tree: its folders, and the vaults in it.
      await explorerOpen(s);
      await s.until(
        () => [/\shousehold$/, /\shobbies$/, /\snotes$/, /\swork$/].every((n) => listed(s, n)),
        3000,
        "home's folders and vaults listed",
      );
      // notes is a vault of its own: enter goes into it.
      await explorerRow(s, "notes");
      await s.keys("enter");
      await s.status(/ notes .*index\.md/, 5000);
      // Across roots by a relative path: a peek, o into the kestrel repository, its top the root; back.
      await s.keys("escape");
      await follow(s, ARCHITECTURE);
      await s.see(PEEK_HINT, 5000);
      await s.keys("o");
      await s.status(/kestrel · main +‹ docs\/architecture\.md/, 5000);
      await s.keys("ctrl+o");
      await s.status(/ notes .*index\.md/, 5000);
    },
  },
  {
    area: "links-and-files",
    name: "roots: from markers — an Obsidian vault and a zk notebook are roots, nothing written into them; root_markers in your config decides",
    covers: { cases: ["links/roots", "vault"] },
    options: {
      home: true,
      startAt: "home/hobbies/cooking/Home.md",
      setup: (s) => {
        if (!before.has(s))
          before.set(s, { cooking: tree(s.path("~/hobbies/cooking")), cycling: tree(s.path("~/hobbies/cycling")) });
      },
    },
    run: async (s) => {
      // .obsidian/ makes cooking a root: unnamed, shown by its path (21.9); its own tree in the explorer, the
      // breadcrumb naming it a vault (VV-D5).
      await s.status(/ ~\/hobbies\/cooking +‹ Home\.md/);
      await explorerOpen(s);
      await s.until(() => listed(s, /\sRecipes$/), 3000, "cooking's own tree");
      await s.until(() => /^~ › hobbies › \S+ cooking ›$/.test(crumbs(s)), 3000, "the breadcrumb: cooking a vault");
      // -: the view a folder up, hobbies a level at a time — cooking highlighted and unfolded (its Recipes under it),
      // cycling a vault beside it, unfolded in place by l; a file of it opened goes into it, the view staying.
      await s.keys("-");
      await s.until(() => listed(s, /\scycling$/), 3000, "hobbies listed");
      s.expect(listed(s, /\sRecipes$/), "cooking still unfolded under it");
      await explorerRow(s, "cycling");
      await s.keys("l");
      await s.until(() => listed(s, /202608151900-index\.md$/), 3000, "cycling unfolded");
      await explorerRow(s, "202608151900-index\\.md");
      await s.keys("enter");
      await s.status(/ ~\/hobbies\/cycling +‹ 202608151900-index\.md/, 5000);
      await explorerOpen(s);
      await s.until(() => listed(s, /\scooking$/), 3000, "the explorer still in hobbies");
      // .zk/ makes cycling one.
      await s.restart({ startAt: "home/hobbies/cycling/202608151900-index.md" });
      await s.status(/ ~\/hobbies\/cycling +‹ 202608151900-index\.md/);
      await s.quit();
      // Opened, read, quit: neither has a file more or less, a byte changed in size — no .slipbox/ made.
      const was = before.get(s)!;
      s.expect(JSON.stringify(tree(s.path("~/hobbies/cooking"))) === JSON.stringify(was.cooking), "cooking as it was");
      s.expect(JSON.stringify(tree(s.path("~/hobbies/cycling"))) === JSON.stringify(was.cycling), "cycling as it was");
      // Your config says what marks a vault: without .obsidian, cooking is a folder of home (VV-D2), its note by its
      // path from home, the view at home, no vault named in it — cooking in home's tree once home is walked, while
      // nobody works (the config's last table is [index]: a second would be no TOML).
      const config = join(s.dir, "config", "slipbox", "config.toml");
      writeFileSync(
        config,
        `${readFileSync(config, "utf8")}idle_seconds = 1\n\n[walk]\nroot_markers = [".git", ".slipbox"]\n`,
      );
      await s.restart({ startAt: "home/hobbies/cooking/Home.md" });
      await s.status(/ ~ +‹ hobbies\/cooking\/Home\.md/);
      await explorerOpen(s);
      await s.until(() => listed(s, /\scooking$/), 20_000, "cooking, a folder of home's tree");
      s.expect(!/cooking/.test(crumbs(s)), `the view at home: ${crumbs(s)}`);
    },
  },
  {
    area: "links-and-files",
    name: "view: a worktree kept outside the view chosen — the view zooms out to the common parent, only both paths unfolded (VV-D5)",
    covers: { cases: ["vault", "explorer", "multiple-roots"], commands: ["git.worktrees"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      // The view starts at the vault: kestrel's top.
      await s.status(/kestrel · main +‹ README\.md/);
      await explorerOpen(s);
      await s.until(() => /^~ › work › \S+ kestrel ›$/.test(crumbs(s)), 3000, "the view at kestrel");
      s.expect(!listed(s, /\sproduct$/), "kestrel's neighbours outside the view");
      await s.keys("escape");
      // The agent's worktree, kept beside the main checkout (~/work/kestrel-agent-sync-retry): chosen, gone into.
      await s.ex("worktrees");
      await s.see("Worktrees (2) — enter: this note there");
      await s.type("sync-retry");
      await s.keys("enter");
      await s.status(/kestrel@agent\/sync-retry +‹ README\.md/, 5000);
      // The view zoomed out to ~/work, the common parent; the breadcrumb leads on to the worktree, where you went.
      await explorerOpen(s);
      await s.until(
        () => /^~ › work › \S+ kestrel-agent/.test(crumbs(s)),
        3000,
        "the view at ~/work, the worktree past it in the breadcrumb",
      );
      // Both paths unfolded — kestrel's folders listed, the worktree's tree under it, the vault open — and only
      // them: the other repositories folded.
      for (const n of [/\skestrel$/, /\skestrel-agent-sync-retry\b/, /\sproduct$/, /\sinfra$/])
        s.expect(listed(s, n), `${n.source} in the view`);
      s.expect(explorer(s).filter((r) => names(r, /\sdocs$/)).length === 2, "docs/ under each of the two");
      s.expect(!listed(s, /\sprd$/) && !listed(s, /\sk8s$/), "product and infra folded");
    },
  },
  {
    area: "links-and-files",
    name: "view: z zooms in on a folder, - out a level; a click on the breadcrumb zooms back in, or out (VV-D5)",
    covers: { cases: ["explorer", "mouse"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      await explorerOpen(s);
      await s.until(() => /^~ › work › \S+ kestrel ›$/.test(crumbs(s)), 3000, "the view at kestrel");
      // z on a folder: the view at it, what's above it in the breadcrumb.
      await explorerRow(s, "docs");
      await s.keys("z");
      await s.until(() => / kestrel › docs ›$/.test(crumbs(s)), 3000, "z: the view at docs");
      await s.until(() => listed(s, /\sarchitecture\.md$/), 3000, "docs' notes");
      s.expect(!listed(s, /\sREADME\.md$/), "the README, above the view, not listed");
      // -: a level up, docs unfolded in it, and in the breadcrumb past the view.
      await s.keys("-");
      await s.until(() => / kestrel › docs$/.test(crumbs(s)), 3000, "-: the view at kestrel, docs past it");
      await s.until(() => listed(s, /\sREADME\.md$/), 3000, "the README in the view again");
      // A click on docs, past the view, zooms back in; one on work, above it, out.
      await clickCrumb(s, "docs");
      await s.until(() => / kestrel › docs ›$/.test(crumbs(s)), 3000, "the click: the view at docs again");
      await clickCrumb(s, "work");
      await s.until(() => /^~ › work › \S+ kestrel › docs$/.test(crumbs(s)), 3000, "the click: the view at ~/work");
      await s.until(() => listed(s, /\sproduct$/), 3000, "work's repositories");
    },
  },
  {
    area: "links-and-files",
    name: "roots: where a file is — a root by its name, an unnamed one by its path; :folders goes into one; a file of home's a link leads to peeked at, o into home; a loose one peeked at, o beside (21.9, 21.10, VV-D2)",
    covers: { cases: ["links/named-folders", "links/roots", "vault"], commands: ["folders.open"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      await s.status(/ notes[ ·]/); // named by its .slipbox/
      s.cliIn("~/hobbies/photography", "ls"); // known here
      await leader(s, "v", "v");
      await s.see(/Folders \(\d+\)/);
      await s.type("photography");
      await s.keys("enter");
      await s.message(" photography — "); // as the switch says it: name — path
      await s.status(/ photography[ ·]/);
      // An Obsidian vault with no .slipbox/ name and no remote: its path, from home.
      await s.restart({ startAt: "home/hobbies/cooking/Home.md" });
      await s.status(/ ~\/hobbies\/cooking /);
      // A file of home's (VV-D2) a link leads to, out of this vault: peeked at, home naming it (VV-D7); o goes into
      // home, the note open there; ctrl+o back.
      await s.restart({ startAt: "home/notes/daily/2026-09-22.md" });
      await follow(s, "the worker log");
      await s.see("~ › Downloads/sync-worker-2026-09-22.log.md", 5000);
      await s.keys("o");
      await s.notSee(PEEK_HINT);
      await s.status(/ ~ +‹ Downloads\/sync-worker-2026-09-22\.log\.md/, 5000);
      await s.see("§ sync-worker log, 2026-09-22", 10000); // read and drawn
      await s.keys("ctrl+o");
      await s.status(/ notes .*2026-09-22\.md/, 5000);
      // A file of Elsewhere's a link leads to: peeked at, Elsewhere naming it; o goes into Elsewhere, its tabs.
      s.write("~/notes/daily/2026-09-22.md", `[elsewhere](${join(s.dir, "elsewhere", "stray-note.md")})\n`);
      await s.restart({ startAt: "home/notes/daily/2026-09-22.md", setup: downloadsElsewhere });
      await follow(s, "elsewhere");
      await s.see("Elsewhere › ", 5000);
      await s.keys("o");
      await s.notSee(PEEK_HINT);
      await s.status(/ Elsewhere .*stray-note\.md/, 5000);
    },
  },
  {
    area: "links-and-files",
    name: "index: the background auto-index finds $HOME's roots while nobody works",
    covers: { cases: ["links/index", "vault"] },
    options: { home: true, startAt: "home/notes/index.md", config: "[index]\nbackground = true\nidle_seconds = 1\n" },
    run: async (s) => {
      // Hands off (a key would pause it): the roots list fills with roots never opened.
      const registry = join(s.dir, "state", "slipbox", "roots.json");
      const found = (rel: string) =>
        existsSync(registry) && readFileSync(registry, "utf8").includes(JSON.stringify(s.path(rel)));
      const roots = ["~/hobbies/photography", "~/work/product", "~/hobbies/cycling"];
      s.expect(!roots.some(found), "none known before it ran");
      await s.until(() => roots.every(found), 60_000, "the auto-index to find photography, product and cycling");
      // The named ones among them (21.6): photography by its .slipbox/ name, product by its remote; cycling (.zk/) has none.
      await leader(s, "v", "v");
      await s.see(/Folders \(\d+\)/);
      await s.see(/photography +~\/hobbies\/photography/);
      await s.see(/product +~\/work\/product/);
    },
  },
  {
    area: "links-and-files",
    name: "index: across a quit — an outside edit's backlink at the next start; a damaged cache rebuilt; space v r reindexes",
    covers: { cases: ["links/index", "links/backlinks"], commands: ["backlinks.open", "vault.reindex"] },
    options: { home: true, startAt: "home/notes/people/priya-nair.md" },
    run: async (s) => {
      const linker = "~/notes/meetings/2026-10-07-outside.md";
      await leader(s, "l", "b");
      await s.see("Linking to", 10000); // once every note is read
      await s.notSee("2026-10-07-outside");
      await s.keys("escape");
      await s.quit();
      // Written while slipbox was closed: no watcher saw it.
      s.write(linker, "# Outside\n\nAsked [Priya](../people/priya-nair.md) about the hiring plan.\n");
      await s.start();
      await leader(s, "l", "b");
      await s.see("2026-10-07-outside", 5000);
      await s.keys("escape");
      await s.quit();
      // Every cache file garbage: started anyway, the note drawn, its backlinks rebuilt.
      const cache = join(s.dir, "cache", "slipbox");
      const files = (readdirSync(cache, { recursive: true }) as string[]).filter((f) =>
        statSync(join(cache, f)).isFile(),
      );
      s.expect(
        files.some((f) => f.endsWith("index.json")),
        "an index in the cache",
      );
      for (const f of files) writeFileSync(join(cache, f), "\x00garbage, not an index\n");
      await s.start();
      await s.see("Priya Nair", 5000);
      await leader(s, "l", "b");
      await s.see("2026-10-07-outside", 8000);
      await s.keys("escape");
      // Reindexed by hand: the folder walked again, said so.
      await leader(s, "v", "r");
      await s.message(/reindex/i, 8000);
    },
  },
];

/** The rows of the list on screen that name the worktree of kestrel's agent branch. */
const worktreeRows = (s: Session) => s.screen().filter((r) => r.includes("kestrel-agent-sync-retry"));

const NAMED: Check[] = [
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
      await s.status(/photography/);
      await s.see("Kyoto"); // the trip's index, in the photography folder
      // kestrel's sync doc: Sam's notes (the notes folder), and the agent's copy on its branch — its worktree.
      s.cliIn("~/notes", "ls");
      await s.restart({ startAt: "home/work/kestrel/docs/sync.md" });
      await follow(s, "his notes");
      await s.see("notes › projects/sync-rewrite.md", 5000);
      await s.keys("o");
      await s.notSee(PEEK_HINT);
      await s.status(/notes/);
      await opened(s, "projects/sync-rewrite.md");
      await s.restart({ startAt: "home/work/kestrel/docs/sync.md" });
      await s.keys("/");
      await s.type("is at");
      await s.keys("enter", "escape", "tab", "enter");
      await s.see(PEEK_HINT, 5000);
      await s.keys("o");
      await s.notSee(PEEK_HINT);
      await s.status(/sync-retry/);
      await opened(s, "docs/sync.md");
    },
  },
  {
    area: "links-and-files",
    name: "naming: :name gives the cooking vault a name its pointer finds; the vault words are gone (21.10, 21.12)",
    covers: { cases: ["links/named-folders", "rename", "links/state"], commands: ["folder.name"] },
    options: { home: true, startAt: "home/hobbies/cooking/Home.md" },
    run: async (s) => {
      await s.ex("name cooking");
      await s.message("is named cooking (.slipbox/"); // the box wraps the rest
      await s.status(/ cooking /);
      s.expect(
        readFileSync(s.path("~/hobbies/cooking/.slipbox/config.toml"), "utf8").includes('name = "cooking"'),
        "the name written into .slipbox/",
      );
      const r = JSON.parse(s.cliIn("~/notes", "resolve", "slipbox://cooking/Home.md", "--json").out).data;
      s.expect(r.status === "resolved" && r.name === "cooking", `the pointer: ${JSON.stringify(r)}`);
      s.expect(s.cliIn("~/notes", "vaults").code === 2, "slipbox vaults is gone");
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
      await s.status(/ halden2 /);
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
      await s.see("kestrel › README.md", 5000);
      await s.keys("o");
      await s.status(/ kestrel[ ·]/);
      await opened(s, "README.md");
      s.expect(!/engine-spike/.test(s.statusLine()), `kestrel, not the spike:\n${s.statusLine()}`);
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
];

const FILES: Check[] = [
  {
    area: "links-and-files",
    name: "explorer files: r renames, m moves, d deletes and u restores, y p copies — links fixed; a note duplicated and deleted",
    covers: { cases: ["copy-move", "trash", "rename"], commands: ["note.copy", "note.delete", "trash.open"] },
    options: { open: "people/contacts.md" },
    run: async (s) => {
      // The explorer on contacts.md (space E reveals it).
      await leader(s, "E");
      await s.status("FILES");
      // The row's menu (its … button; . by key): the entries with their keys; r there renames.
      await s.keys(".");
      await s.see(/Move to… +m/);
      await s.see(/Delete +d/);
      await s.keys("r");
      await s.see("rename people/contacts.md to:"); // a question in its own window
      await s.see("OK  enter");
      await s.keys("ctrl+u");
      await s.type("people-contacts");
      await s.keys("enter");
      await s.see(/people\/contacts\.md → people\/people-contacts\.md: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("renamed people/contacts.md");
      s.expect(s.exists("people/people-contacts.md") && !s.exists("people/contacts.md"), "renamed on disk");
      s.expect(s.read("home.md").includes("(people/people-contacts.md)"), "home's link follows it");
      // m: to the handbook folder.
      await s.keys("m");
      await s.see("Move people/people-contacts.md to…");
      await s.type("handbook");
      await s.keys("enter");
      await s.see(/→ handbook\/people-contacts\.md/);
      await s.keys("enter");
      await s.file("handbook/people-contacts.md", (t) => t.length > 0, "moved to the handbook");
      // d, then u.
      await s.keys("d");
      await s.see(/Delete handbook\/people-contacts\.md\?/); // a question in its own window: y answers
      await s.see("Yes  y");
      await s.type("y");
      await s.message("deleted handbook/");
      s.expect(!s.exists("handbook/people-contacts.md"), "gone from the vault");
      await s.keys("u");
      await s.message("restored handbook/");
      s.expect(s.exists("handbook/people-contacts.md"), "back");
      // y p: a copy beside it.
      await s.keys("y", "p");
      await s.message("copied handbook/");
      s.expect(s.exists("handbook/people-contacts-copy.md"), "the copy made");
      // The trash is listed, empty now.
      await leader(s, "v", "t");
      await s.message("the trash is empty");
      // The current note: duplicated (the palette), opened; then that copy deleted (space n d).
      await s.keys("escape");
      await s.keys(":");
      await s.type("Duplicate the note");
      await s.keys("enter");
      await s.status("people-contacts-copy-2.md");
      await leader(s, "n", "d");
      await s.see(/Delete handbook\/people-contacts-copy-2\.md\?/);
      await s.type("y");
      await s.message("deleted handbook/");
      s.expect(!s.exists("handbook/people-contacts-copy-2.md"), "the copy deleted");
    },
  },
  {
    area: "links-and-files",
    name: "files: space n — the note moved to a folder, copied and pasted, cut, deleted and restored, duplicated",
    covers: {
      cases: ["copy-move", "trash"],
      commands: ["note.move", "note.yank", "note.cut", "folder.paste", "note.delete", "trash.restore", "note.copy"],
    },
    options: { open: "people/contacts.md" },
    run: async (s) => {
      // space n shift+m: a folder picked from the tree; links fixed after a preview.
      await leader(s, "n", "shift+m");
      await s.see("Move people/contacts.md to…");
      await s.type("handbo");
      await s.keys("enter");
      await s.see(/people\/contacts\.md → handbook\/contacts\.md: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.file("handbook/contacts.md", (t) => t.includes("# Contacts"), "moved into handbook/");
      await opened(s, "handbook/contacts.md");
      s.expect(s.read("home.md").includes("(handbook/contacts.md)"), "home's link follows it");
      // space n y, then space d p: a copy pasted in this note's folder, beside it.
      await leader(s, "n", "y");
      await s.message("copied handbook/contacts.md");
      await leader(s, "d", "p");
      await s.file("handbook/contacts-copy.md", (t) => t.includes("# Contacts"), "a copy beside it");
      // space n x, then space d p where it already is: nothing to move.
      await leader(s, "n", "x");
      await s.message("cut handbook/contacts.md");
      await leader(s, "d", "p");
      await s.message("already in handbook");
      // space n d: to the trash, asked first; space v u: back.
      await leader(s, "n", "d");
      await s.see(/Delete handbook\/contacts\.md\?/);
      await s.type("y");
      await s.message("deleted handbook/contacts.md");
      s.expect(!s.exists("handbook/contacts.md"), "gone to the trash");
      await leader(s, "v", "u");
      await s.message("restored handbook/contacts.md");
      s.expect(s.exists("handbook/contacts.md"), "back");
      // space n shift+y: duplicated beside it, the copy opened.
      await leader(s, "n", "shift+y");
      await opened(s, "handbook/contacts-copy-2.md");
      s.expect(s.exists("handbook/contacts-copy-2.md"), "the duplicate written");
    },
  },
  {
    area: "links-and-files",
    name: "files: space d — this note's folder copied and pasted, renamed, moved, cut, deleted and restored",
    covers: {
      cases: ["copy-move", "trash", "rename"],
      commands: ["folder.yank", "folder.paste", "folder.rename", "folder.move", "folder.cut", "folder.delete"],
    },
    options: { open: "people/contacts.md" },
    run: async (s) => {
      // Copied, then pasted into itself: refused; pasted at the top (home's folder): a copy beside it.
      await leader(s, "d", "y");
      await s.message("copied people/");
      await leader(s, "d", "p");
      await s.message("people can't be copied into itself");
      await open(s, "home");
      await leader(s, "d", "p");
      await s.until(() => s.exists("people-copy/contacts.md"), 3000, "people/ copied beside itself");
      await open(s, "kenji-mori");
      await opened(s, "people/kenji-mori.md");
      // Renamed in place, its links fixed after a preview; the note open follows it.
      await leader(s, "d", "r");
      await s.see("rename people/ to:");
      await s.keys("ctrl+u");
      await s.type("folk");
      await s.keys("enter");
      await s.see(/people\/ → folk\/: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("moved people/ → folk/");
      await opened(s, "folk/kenji-mori.md");
      s.expect(s.read("home.md").includes("(folk/kenji-mori.md)"), "home's link into it follows");
      // Moved into handbook/, picked from the tree.
      await leader(s, "d", "m");
      await s.see("Move folk/ to…");
      await s.type("handbo");
      await s.keys("enter");
      await s.see(/folk\/ → handbook\/folk\/: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("moved folk/ → handbook/folk/");
      await opened(s, "handbook/folk/kenji-mori.md");
      // Cut: said, waiting for a paste.
      await leader(s, "d", "x");
      await s.message("cut handbook/folk/");
      // Deleted, asked first with what breaks; restored.
      await leader(s, "d", "d");
      await s.see(/Delete handbook\/folk\/ and everything in it\?/);
      await s.type("y");
      await s.message("deleted handbook/folk to the trash");
      s.expect(!s.exists("handbook/folk"), "gone to the trash");
      await s.status("deleted on disk");
      await leader(s, "v", "u");
      await s.message("restored handbook/folk");
      s.expect(s.exists("handbook/folk/kenji-mori.md"), "back");
    },
  },
  {
    area: "links-and-files",
    name: "files: space v m gives this note's folder .slipbox/, a root of its own; space v shift+m makes it plain again",
    covers: { cases: ["vault", "links/state"], commands: ["vault.init", "vault.unmake"] },
    options: { open: "people/contacts.md" },
    run: async (s) => {
      const home = s.read("home.md");
      await leader(s, "v", "m");
      await s.see("give people/ its .slipbox/, called (empty: no name):");
      await s.keys("enter");
      await s.see(/people\/ → a vault of its own, called .*: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("made people/ a vault of its own");
      s.expect(s.exists("people/.slipbox/config.toml"), "people/ has its .slipbox/");
      s.expect(s.read("home.md") === home, "home's paths into it as they were");
      // At the top of halden, this root isn't nested: nothing to take away.
      await leader(s, "v", "shift+m");
      await s.message("halden isn't inside another vault");
      // In a root nested in halden (outreach, by home's link): made part of halden.
      await open(s, "home");
      await s.keys("shift+g", "enter");
      await s.see("outreach › index.md", 5000); // a peek (VV-D7): o goes into it
      await s.keys("o");
      await s.message(" outreach — ");
      await leader(s, "v", "shift+m");
      await s.see(/outreach\/ → part of halden: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("made outreach/ part of halden");
      s.expect(!s.exists("outreach/.slipbox"), "its .slipbox/ gone (to the trash)");
    },
  },
  {
    area: "links-and-files",
    name: "files: a folder with an unsaved note open in it isn't renamed — said, the edit kept; saved, it is, the note open from its new place",
    covers: { cases: ["copy-move", "rename"], commands: ["folder.rename", "view.source", "note.save"] },
    options: { open: "people/contacts.md" },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("G", "o");
      await s.type("Typed before the move");
      await s.keys("escape");
      await s.status("unsaved");
      await leader(s, "d", "r");
      await s.see("rename people/ to:");
      await s.keys("ctrl+u");
      await s.type("folk");
      await s.keys("enter");
      await s.message("unsaved: people/contacts.md");
      s.expect(s.exists("people/contacts.md") && !s.exists("folk"), "nothing moved while the note is unsaved");
      await s.see("Typed before the move");
      await s.status("unsaved");
      // Saved, the same rename goes ahead: previewed, carried out, the note open from folk/ with its text.
      await s.keys("ctrl+s");
      await s.file("people/contacts.md", (t) => t.includes("Typed before the move"), "the edit saved where it was");
      await leader(s, "d", "r");
      await s.see("rename people/ to:");
      await s.keys("ctrl+u");
      await s.type("folk");
      await s.keys("enter");
      await s.see("people/ → folk/");
      await s.keys("enter");
      await s.file(
        "folk/contacts.md",
        (t) => t.includes("Typed before the move"),
        "the folder renamed, the note in it",
      );
      s.expect(!s.exists("people"), "people/ gone");
      await s.status("folk/contacts.md");
      await s.see("Typed before the move");
    },
  },
  {
    area: "links-and-files",
    name: "trash: two notes deleted, space v t lists them and ends with Empty the trash…; enter, y, gone for good (DF-D14)",
    covers: { cases: ["trash"], commands: ["note.delete", "trash.open", "trash.empty"] },
    run: async (s) => {
      for (const [name, path] of [
        ["wrap-probe", "scratch/wrap-probe.md"],
        ["broken-frontmatter", "scratch/broken-frontmatter.md"],
      ] as const) {
        await open(s, name);
        await leader(s, "n", "d");
        await s.see(`Delete ${path}?`);
        await s.type("y");
        await s.message(`deleted ${path}`);
        s.expect(!s.exists(path), `${path} gone to the trash`);
      }
      // The trash's list: newest first, a blank row, then the last row, which empties it.
      await leader(s, "v", "t");
      await s.see("Trash (2) — enter restores");
      await s.see("Empty the trash…");
      // Each item's row with when it was deleted (not the boxes saying so, which may still show).
      const [b, a, empty] = [
        s.rowOf(/\bbroken-frontmatter\.md +\d{4}-\d\d-\d\d \d\d:\d\d/),
        s.rowOf(/\bwrap-probe\.md +\d{4}-\d\d-\d\d \d\d:\d\d/),
        s.rowOf("Empty the trash…"),
      ];
      s.expect(
        b >= 0 && a > b && empty > a + 1,
        `broken-frontmatter, wrap-probe, then Empty the trash… last (rows ${b}, ${a}, ${empty})`,
      );
      // up from the first row: the last one; enter asks — n keeps them.
      await s.keys("up", "enter");
      await s.see("Empty the trash? Its 2 items go for good");
      await s.keys("n");
      await s.notSee("Empty the trash? Its 2 items go for good");
      s.expect(s.cli("trash").out.includes("wrap-probe.md"), "kept");
      // :empty-trash opens the list on that row: enter asks the same; y empties it.
      await s.keys("escape");
      await s.notSee("Trash (2)");
      await s.ex("empty-trash");
      await s.see("Trash (2) — enter restores");
      await s.keys("enter");
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
      s.expect(!s.exists("scratch/wrap-probe.md") && !s.exists("scratch/broken-frontmatter.md"), "neither note back");
    },
  },
];

const RENAMES: Check[] = [
  {
    area: "links-and-files",
    name: "rename: space n m previews every change, enter renames; each link follows, nothing else written into the note",
    covers: { cases: ["rename", "links/conventions", "links/moves"], commands: ["note.rename"] },
    run: async (s) => {
      await open(s, "kenji-mori");
      await leader(s, "n", "m");
      await s.see("rename or move people/kenji-mori.md to:");
      await s.keys("ctrl+u");
      await s.type("people/kenji");
      await s.keys("enter");
      await s.see(/people\/kenji-mori\.md → people\/kenji\.md: \d+ changes in \d+ files/);
      await s.see("home.md:28");
      await s.keys("enter");
      await s.message("renamed people/kenji-mori.md → people/kenji.md");
      await opened(s, "people/kenji.md");
      s.expect(!s.exists("people/kenji-mori.md"), "the old file is gone");
      await s.file(
        "people/kenji.md",
        (t) => t.includes("# Kenji Mori") && !t.includes("previous_names"),
        "no old name written into it (21.12)",
      );
      s.expect(
        s.read("home.md").includes("- [kenji-mori](people/kenji.md) — our visiting astronomer"),
        "home's link follows",
      );
      s.expect(
        s.read("people/partners-and-names.md").includes("[kenji-mori.md](kenji.md); the names"),
        "the note beside it too",
      );
      s.expect(
        s.read("people/partners-and-names.md").includes("![kenji-mori › Kenji Mori](kenji.md#kenji-mori)"),
        "the embed follows",
      );
      // The explorer's r asks for the selected note's new name; esc cancels.
      await leader(s, "e");
      await s.keys("r");
      await s.see(/rename .* to:/);
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "rename: a link written later to the old path — relinked; then undone, newest first, every file as it was (7.4)",
    covers: {
      cases: ["rename", "links/moves", "links"],
      commands: ["note.rename", "note.open", "link.relink", "rename.undo"],
    },
    run: async (s) => {
      await open(s, "kenji-mori");
      await leader(s, "n", "m");
      await s.see("rename or move people/kenji-mori.md to:");
      await s.keys("ctrl+u");
      await s.type("people/kenji");
      await s.keys("enter", "enter");
      await s.file("people/kenji.md", (t) => t.includes("# Kenji Mori"), "renamed");
      // An agent's note, written now with the old path: broken, its move known — relink rewrites it.
      s.write("late-note.md", "# Late\n\nAsk [Kenji](people/kenji-mori.md) about Aster.\n");
      await s.ex("e late-note.md");
      await opened(s, "late-note.md");
      await s.see("Ask Kenji about Aster.");
      await leader(s, "l", "r");
      await s.see("relink: 1 change in 1 file");
      await s.keys("enter");
      await s.file("late-note.md", (t) => t.includes("Ask [Kenji](people/kenji.md) about Aster."), "the link relinked");
      // Undo (7.4), newest first, each previewed: the relink, then the rename — every file as it was.
      await leader(s, "v", "shift+u");
      await s.see("undo: relink: 1 change in 1 file");
      await s.keys("enter");
      await s.file(
        "late-note.md",
        (t) => t.includes("Ask [Kenji](people/kenji-mori.md) about Aster."),
        "the relink undone",
      );
      await leader(s, "v", "shift+u");
      await s.see(/undo: people\/kenji\.md → people\/kenji-mori\.md: \d+ changes/);
      await s.keys("enter");
      await s.message("renamed people/kenji.md back to"); // the toast wraps the rest
      await s.file("people/kenji-mori.md", (t) => !t.includes("previous_names"), "the note back, as it was");
      s.expect(!s.exists("people/kenji.md"), "the new name is gone");
      s.expect(
        s.read("home.md").includes("- [kenji-mori](people/kenji-mori.md) — our visiting astronomer"),
        "home's link back",
      );
    },
  },
  {
    area: "links-and-files",
    name: "rename: a heading — its line, and the embed of it elsewhere (11.9)",
    covers: { cases: ["rename", "links/fragments"], commands: ["heading.rename"] },
    run: async (s) => {
      await open(s, "kenji-mori");
      await s.ex("14");
      await leader(s, "n", "h");
      await s.see('rename the heading "Kenji Mori" to:');
      await s.keys("ctrl+u");
      await s.type("Kenji Mori, astronomer");
      await s.keys("enter");
      await s.see(/#Kenji Mori → people\/kenji-mori\.md#Kenji Mori, astronomer: \d+ changes/); // the title is cut there
      await s.keys("enter");
      await s.file("people/kenji-mori.md", (t) => t.includes("# Kenji Mori, astronomer\n"), "the heading renamed");
      s.expect(
        s.read("people/partners-and-names.md").includes("(kenji-mori.md#kenji-mori-astronomer)"),
        "the embed follows",
      );
    },
  },
  {
    area: "links-and-files",
    name: "rename: space n m into a folder — named, the note's name kept; or ending in /, the folder made (DF-D4)",
    covers: { cases: ["rename", "copy-move"], commands: ["note.rename"] },
    run: async (s) => {
      // space n m with an existing folder's name: into it, the note's own name kept.
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
    area: "links-and-files",
    name: "convert-links: a root's wikilinks made paths after a preview, an ambiguous one picked; an embed still drawn, a block followed, undone",
    covers: { cases: ["convert-links", "links/wikilinks"], commands: ["link.convert", "rename.undo"] },
    options: { home: true, startAt: "home/hobbies/cooking/Pantry.md" },
    run: async (s) => {
      const HOME = "~/hobbies/cooking/Home.md";
      const was = s.read(HOME);
      await s.ex("convert-links");
      await s.see(/links → plain paths: \d+ changes? in \d+ files?/, 10000);
      await s.see("pick Home.md:18");
      await s.see("pick Pantry.md:24");
      // `![[dal.png|300]]`: two pictures answer to it — its candidates, one picked; the preview again, with it.
      await s.keys("enter");
      await s.see("![[dal.png|300]] in Home.md:18 — which note?");
      await s.see("Archive/attachments/dal.png");
      await s.keys("down", "enter");
      await s.see(/links → plain paths: \d+ changes? in \d+ files?/);
      await s.notSee("pick Home.md:18");
      // Pantry's `[[dal.png]]` likewise; then nothing left to pick.
      await s.keys("enter");
      await s.see("[[dal.png]] in Pantry.md:24 — which note?");
      await s.keys("down", "enter");
      await s.see(/links → plain paths: \d+ changes? in \d+ files?/);
      await s.notSee("pick Pantry.md:24");
      await s.keys("enter");
      await s.message(/converted links to plain paths: \d+ changes/); // short: the box wraps the rest
      await s.file(
        HOME,
        (t) =>
          t.includes("[Pantry](Pantry.md)") &&
          t.includes("[Shakshuka](Recipes/Weeknight/Shakshuka.md)") &&
          t.includes("(attachments/dal.png)"),
        "converted, the picked picture's path among them",
      );
      // The embed, a path now, still drawn in place: the pantry's CSV as a table.
      s.expect(s.read("~/hobbies/cooking/Pantry.md").includes("![pantry.csv](pantry.csv)"), "the embed a path");
      await s.see(/[│┃].*[│┃].*[│┃]/);
      // The block link, a path now, followed: at the step its ^id closes.
      await s.restart({ startAt: "home/hobbies/cooking/Recipes/Weeknight/Dal.md" });
      await follow(s, "Dal › ^tadka");
      await s.status(/L3[23]:/);
      // Undone: every note as it was.
      await s.ex("undo-rename");
      await s.see(/undo: links → plain paths/);
      await s.keys("enter");
      await s.message(/undid the conversion to plain paths/);
      await s.file(HOME, (t) => t === was, "Home.md as it was");
    },
  },
];

const KESTREL = "~/work/kestrel";
/** Who commits — a merge, a rebase: the set's home has no ~/.gitconfig, and git won't commit without a name. */
const IDENTITY = {
  GIT_AUTHOR_NAME: "Sam Rivera",
  GIT_AUTHOR_EMAIL: "sam@kestrel.dev",
  GIT_COMMITTER_NAME: "Sam Rivera",
  GIT_COMMITTER_EMAIL: "sam@kestrel.dev",
};
const SYNC = "~/work/kestrel/docs/sync.md";

/** kestrel's origin made a bare repository in the check's folder (no network) — main pushed there and tracked, if
 *  asked. Its path. */
function bareOrigin(s: Session, track: boolean): string {
  const bare = join(s.dir, "remote", "kestrel.git");
  const made = spawnSync("git", ["init", "-q", "--bare", "-b", "main", bare], {
    env: { ...process.env, HOME: s.home },
  });
  s.expect(made.status === 0, `a bare repository made: ${made.stderr}`);
  gitOk(s, "origin set to it", true, KESTREL, "remote", "set-url", "origin", bare);
  if (track) gitOk(s, "main pushed there, tracked", true, KESTREL, "push", "-q", "-u", "origin", "main");
  return bare;
}

/** Someone else's commit on origin's main: a clone of it (made once), a line added to a file, pushed. */
function pushedElsewhere(s: Session, file: string, line: string): void {
  const other = join(s.dir, "other");
  if (!existsSync(other)) gitOk(s, "a clone", true, s.dir, "clone", "-q", join(s.dir, "remote", "kestrel.git"), other);
  else gitOk(s, "the clone brought up to date", true, other, "pull", "-q", "--ff-only");
  writeFileSync(join(other, file), `${readFileSync(join(other, file), "utf8")}\n${line}`);
  gitOk(s, "their commit", true, other, "commit", "-qam", "Theirs");
  gitOk(s, "their push", true, other, "push", "-q");
}

const GIT: Check[] = [
  {
    area: "links-and-files",
    name: "git: a branch switch while it runs — the branch on the status line, said once, each branch's tabs back",
    covers: { cases: ["git", "links/git"], commands: ["note.open"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      await s.status(/kestrel · main +‹ README\.md/);
      gitOk(s, "checkout from outside", true, KESTREL, "checkout", "-q", "jo/release-notes-wording");
      await s.message("switched to branch jo/release-notes-wording", 5000);
      await s.status(/ · jo\/release-notes-wording /);
      await s.ex("e docs/architecture.md");
      await opened(s, "docs/architecture.md");
      // Back on main: its tabs as they were left there; and again.
      git(s, KESTREL, "checkout", "-q", "main");
      await s.message("switched to branch main: its tabs are back", 5000);
      await opened(s, "README.md");
      git(s, KESTREL, "checkout", "-q", "jo/release-notes-wording");
      await s.status(/ · jo\/release-notes-wording /, 5000);
      await opened(s, "docs/architecture.md");
      s.expect(
        (await messagesSaying(s, "switched main", /switched to branch main/)) === 1,
        "the switch to main said once",
      );
    },
  },
  {
    area: "links-and-files",
    name: "git: what this branch changed — :changes lists it, enter a file's diff; :diff this note's; the explorer's marks",
    covers: { cases: ["git", "links/git"], commands: ["git.changes", "git.diff"] },
    options: { home: true, startAt: "home/work/kestrel-agent-sync-retry/docs/sync.md" },
    run: async (s) => {
      // The agent's worktree: its branch's commits against main — a rename among them, by git's own evidence.
      await s.ex("changes");
      await s.see(/Changed against main \(\d+\) — enter: the diff/, 5000);
      await s.see("M docs/sync.md");
      await s.see(/R src\/sync\/backoff\.ts/);
      await s.type("docs/sync");
      await s.keys("enter");
      await s.see("docs/sync.md against main — esc: the changes", 5000);
      // A note's diff: its blocks before and after; the table's row the agent added, framed once.
      await s.see("┌ added");
      await s.see("spent │ out of retry budget; kept in the log, never sent again");
      await s.keys("escape");
      await s.see(/Changed against main \(\d+\)/);
      await s.keys("escape");
      // This note's own: the branch's changes to it.
      await s.ex("diff");
      await s.see("[a] -> [c]            [b] failed five times: spent, and support sees it", 5000);
      await s.keys("escape");
      // An agent's edit, not committed: the explorer marks the file.
      s.write(
        "~/work/kestrel-agent-sync-retry/README.md",
        `${s.read("~/work/kestrel-agent-sync-retry/README.md")}\nA line the agent added.\n`,
      );
      await explorerOpen(s);
      await s.see(/README\.md +M/, 6000);
    },
  },
  {
    area: "links-and-files",
    name: "git: a diff marks a changed line's changed words, and a line too long reaches its end by scrolling sideways",
    covers: { cases: ["git", "links/git"], commands: ["git.diff", "git.diff_view"] },
    // Narrow enough that the agent's longest line doesn't fit the diff's window.
    options: { home: true, startAt: "home/work/kestrel-agent-sync-retry/docs/sync.md", size: { cols: 120, rows: 40 } },
    run: async (s) => {
      await s.ex("diff");
      await s.see("docs/sync.md against main", 5000);
      // A note's diff opens as its blocks; tab, its lines.
      await s.see("┌ before");
      await s.keys("tab");
      await s.notSee("┌ before");
      // The line whose numbers the agent changed: those words on the stronger tint, the rest of it on the line's.
      await s.see("+ The numbers are `DEFAULT_POLICY` in [lines 12 to 15 of retry.ts](../src/sync/retry.ts#L12-L15).");
      await s.see("- The numbers are `DEFAULT_POLICY` in [lines 17 to 21 of retry.ts](../src/sync/retry.ts#L17-L21).");
      const bg = (needle: string) => s.styleOf(needle)?.bg?.toLowerCase() ?? null;
      const roles = loadTheme("tokyo-night", "/nonexistent").theme.roles;
      const tint = (role: Role) => roles[role].bg!.toLowerCase();
      s.expect(bg("12 to 15") === tint("diff_add_word"), "an added word marked");
      s.expect(bg("to 15 of retry.ts") === tint("diff_add"), "the rest of its line on the line's tint");
      s.expect(bg("17 to 21") === tint("diff_del_word"), "a removed word marked");
      s.expect(bg("to 21 of retry.ts") === tint("diff_del"), "the rest of its line on the line's tint");
      // A sentence rewritten: no line like it to pair with, so nothing in it marked.
      s.expect(bg("Each op has a retry budget") === tint("diff_add"), "a line with no pair: tinted, not marked");
      // The agent's longest line: whole, never cut with …, its end out of sight until the rows scroll to it.
      await s.see("the sixth failure parks it");
      const row = () => s.screen()[s.rowOf("the sixth failure parks")] ?? "";
      s.expect(!row().includes("…") && !row().includes("hold the whole queue."), "its end beyond the edge, not cut");
      await s.keys("/");
      await s.type("sixth");
      await s.keys("enter", "$");
      await s.see("hold the whole queue.");
      s.expect(row().includes("+‹"), "its start scrolled out of sight, said so");
      await s.keys("0");
      await s.see("+ ([ADR 4](adr/0004-retry-budget.md));");
      await s.notSee("hold the whole queue.");
      await s.keys("escape", "escape");
      await s.notSee("docs/sync.md against main");
    },
  },
  {
    area: "links-and-files",
    name: "git: :merge-review — a merge's broken links before it, each fix said; after it, git's rename says where a file went (20.21)",
    covers: { cases: ["git", "links/git"], commands: ["git.merge_review", "link.relink"] },
    options: { home: true, startAt: "home/work/kestrel/docs/architecture.md" },
    run: async (s) => {
      await s.status(/kestrel · main /);
      await s.ex("merge-review");
      await s.see("Review a merge — enter: the links it would break", 5000);
      await s.type("refactor/docs-layout");
      await s.keys("enter");
      await s.see(/Merging refactor\/docs-layout into main: \d+ links would break/, 10000);
      await s.type("architecture.md:42");
      await s.see("docs/architecture.md:42");
      await s.see("refactor/docs-layout moves docs/sync.md to docs/architecture/"); // cut at the list's width
      await s.keys("enter");
      await opened(s, "docs/architecture.md");
      await s.status(/L42:/);
      // Merged: git's rename is evidence here — the link says where its file went; space l r fixes it.
      gitOk(s, "the merge", true, KESTREL, "merge", "-q", "--no-edit", "refactor/docs-layout");
      await s.message("branch main moved on: git moved 1 file", 8000);
      await leader(s, "l", "r");
      await s.see(/relink: \d+ changes? in 1 file/, 5000);
      await s.keys("enter");
      await s.file(
        "~/work/kestrel/docs/architecture.md",
        (t) => t.includes("(architecture/sync.md)") && !t.includes("](sync.md)"),
        "the links relinked",
      );
    },
  },
  {
    area: "links-and-files",
    name: "git: a worktree — name@branch, :worktrees lists both checkouts, enter opens the note in the other",
    covers: { cases: ["git", "links/git"], commands: ["git.worktrees"] },
    options: { home: true, startAt: "home/work/kestrel-agent-sync-retry/README.md" },
    run: async (s) => {
      // The build's worktree of kestrel (git worktree add): named for its main checkout and its branch.
      await s.status(/kestrel@agent\/sync-retry +‹ README\.md/);
      await s.ex("worktrees");
      await s.see("Worktrees (2) — enter: this note there");
      await s.see(/\smain\s+\/\S+\/work\/kestrel\s/); // the main checkout (after its branch icon)
      await s.see(/●\s+(\S+\s+)?agent\/sync-retry\s+\/\S+\/work\/kestrel-agent-sync-retry/); // this one, marked
      await s.type("main");
      await s.keys("enter");
      await s.status(/kestrel · main +‹ README\.md/, 5000);
      // Back: the worktree again, as a vault of its own.
      await s.keys("ctrl+o");
      await s.status(/kestrel@agent\/sync-retry +‹ README\.md/, 5000);
    },
  },
  {
    area: "links-and-files",
    name: "git: a merge's conflict — Problems at its first marker, the explorer's !, gone with --abort; git mv marked R",
    covers: { cases: ["git", "links/git"], commands: ["problems.open"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      const notes = "~/work/kestrel/docs/release-notes/2.3.md";
      // Jo's branch rewords the lines main changed too.
      gitOk(s, "the merge stops on a conflict", false, KESTREL, "merge", "jo/release-notes-wording");
      const marker =
        s
          .read(notes)
          .split("\n")
          .findIndex((l) => l.startsWith("<<<<<<<")) + 1;
      s.expect(marker > 0, "the release notes hold git's markers");
      await leader(s, "v", "p");
      // Filtered to the file (the panel is a third of the screen): under Conflicts, at its first marker.
      await s.keys("/");
      await s.type("release-notes/2.3");
      await s.see(/Conflicts \(1\)/, 5000);
      await s.see("docs/release-notes/2.3.");
      // enter: the note at its first marker, the conflict said.
      await s.keys("enter");
      await s.status("docs/release-notes/2.3.md", 5000);
      await s.status(`L${marker}:1`);
      await problemListed(s, "a merge conflict: both sides are still here");
      // The explorer marks it `!` (its row unselected: a selected row shows its buttons there).
      await leader(s, "E");
      await s.status("FILES");
      await s.keys("k");
      await s.see(/2\.3\.md\s+!\s*[│┃]/, 5000);
      // Aborted: no mark, no Conflicts.
      gitOk(s, "git merge --abort", true, KESTREL, "merge", "--abort");
      await s.until(() => s.rowOf(/2\.3\.md\s+[│┃]/) >= 0 && s.rowOf(/2\.3\.md\s+!/) < 0, 6000, "the ! gone");
      await leader(s, "v", "p");
      await s.see(/Broken links \(\d+\)/);
      await s.notSee(/Conflicts/);
      // A rename git knows of: R at its new name.
      gitOk(s, "git mv", true, KESTREL, "mv", "docs/glossary.md", "docs/terms.md");
      await leader(s, "E");
      await s.see(/terms\.md\s+R\s*[│┃]/, 6000);
    },
  },
  {
    area: "links-and-files",
    name: "git: a detached HEAD on the status line; a switch bringing a rename isn't a move; a rebase lands as one change",
    covers: { cases: ["git", "links/git"], commands: ["link.relink"] },
    options: { home: true, startAt: "home/work/kestrel/docs/architecture.md" },
    run: async (s) => {
      await s.status(/kestrel · main +‹ docs\/architecture\.md/);
      // Detached: its commit where the branch would be.
      git(s, KESTREL, "checkout", "-q", "--detach", "HEAD~1");
      const sha = git(s, KESTREL, "rev-parse", "HEAD").out.trim();
      await s.until(
        () => {
          const m = / · ([0-9a-f]{7,40}) /.exec(s.statusLine());
          return !!m && sha.startsWith(m[1]!);
        },
        5000,
        `the status line on ${sha.slice(0, 7)}`,
      );
      git(s, KESTREL, "checkout", "-q", "main");
      await s.status(/kestrel · main /, 5000);
      // refactor/docs-layout has docs/sync.md under architecture/: architecture.md's links to it break, but a
      // switch's files coming and going aren't moves — nothing to relink.
      gitOk(s, "checkout refactor/docs-layout", true, KESTREL, "checkout", "-q", "refactor/docs-layout");
      await s.message("switched to branch refactor/docs-layout", 5000);
      await s.status(/ · refactor\/docs-layout +‹ docs\/architecture\.md/);
      s.expect(
        s.read("~/work/kestrel/docs/architecture.md").includes("[sync.md](sync.md)") &&
          !s.exists("~/work/kestrel/docs/sync.md"),
        "a link the switch broke",
      );
      await leader(s, "l", "r");
      await s.see("relink: 0 changes in 0 files", 5000);
      await s.keys("escape");
      git(s, KESTREL, "checkout", "-q", "main");
      await s.message("switched to branch main", 5000);
      // A rebase lands as one change: git holds a detached HEAD while it replays (a second and a half here, as
      // one stopped on a conflict holds it for minutes); then the branch moved on, git's renames said once, and
      // no switch said — not to the detached HEAD, nor back.
      git(s, KESTREL, "checkout", "-q", "cleanup/remove-legacy");
      await s.message("switched to branch cleanup/remove-legacy", 5000);
      // What's said so far (the detach above is said only if a poll saw it before main was back).
      const detachedBefore = await messagesSaying(s, "switched detached", /switched to a detached HEAD/);
      const old = git(s, KESTREL, "rev-parse", "HEAD").out.trim();
      s.expect(
        git(s, KESTREL, "rebase", "-q", "--autostash", "--exec", "sleep 1.5", "main").code === 0,
        "the rebase applies (the local .editorconfig stashed and back)",
      );
      const renames = git(s, KESTREL, "diff", "-M", "--name-status", old, "HEAD")
        .out.split("\n")
        .filter((l) => l.startsWith("R")).length;
      s.expect(renames > 0, "the rebase brings renames");
      await s.message("cleanup/remove-legacy moved on", 8000); // the box wraps the rest
      await s.status(/ · cleanup\/remove-legacy +‹ docs\/architecture\.md/); // the tabs stay
      s.expect(
        (await messagesSaying(s, "moved on", new RegExp(`moved on: git moved ${renames} files`))) === 1,
        "git's renames said once",
      );
      s.expect(
        (await messagesSaying(s, "switched cleanup", /switched to branch cleanup\/remove-legacy/)) === 1,
        "no switch said back to the branch",
      );
      s.expect(
        (await messagesSaying(s, "switched detached", /switched to a detached HEAD/)) === detachedBefore,
        "no detach said for the rebase",
      );
    },
  },
  {
    area: "links-and-files",
    name: "git: source control — a file staged, committed, the commit amended; trusted, then no longer",
    covers: { cases: ["git"], commands: ["git.view", "git.commit", "git.amend", "root.trust", "root.untrust"] },
    options: {
      home: true,
      startAt: "home/work/kestrel/docs/sync.md",
      // Who commits: the set's home has no ~/.gitconfig, and git won't commit without a name.
      env: {
        GIT_AUTHOR_NAME: "Sam Rivera",
        GIT_AUTHOR_EMAIL: "sam@kestrel.dev",
        GIT_COMMITTER_NAME: "Sam Rivera",
        GIT_COMMITTER_EMAIL: "sam@kestrel.dev",
      },
    },
    run: async (s) => {
      const count = () => Number(git(s, KESTREL, "rev-list", "--count", "HEAD").out.trim());
      const commits = count();
      s.write(SYNC, `${s.read(SYNC)}\nA line the agent added.\n`);
      await s.status("reloaded", 5000);
      // A commit with nothing staged: said how to stage.
      await s.keys(":");
      await s.type("Commit");
      await s.keys("enter");
      await s.message("nothing staged — s stages a file in the git panel");
      // space g: the git panel, the changed files by section; s stages the one selected.
      await leader(s, "g");
      await s.see("Source control");
      await s.see(/Changes \(\d+\)/, 5000);
      await s.see(/M sync\.md +docs/);
      // The first row is Changes' heading, then the local .editorconfig, then sync.md: selected (its row drawn apart
      // from the heading's).
      const bgOf = (text: string) => s.runs()[s.rowOf(text)]?.find((r) => r.text.includes(text))?.bg;
      await s.keys("g", "g", "j", "j");
      await s.until(() => bgOf("M sync.md") !== bgOf("Changes ("), 3000, "sync.md selected");
      await s.keys("s");
      await s.message("staged docs/sync.md", 5000);
      await s.see("Staged (1)", 5000);
      // c: the commit's message in a floating editor, typed at once; ctrl+s commits. Not trusted: no hooks run,
      // nothing signed, said there.
      await s.keys("c");
      await s.see("# Committing: 1 file staged (docs/sync.md).");
      await s.see("# This vault isn't trusted: its hooks don't run, and the commit isn't signed");
      await s.type("Docs: the line the agent added");
      await s.keys("escape", "ctrl+s");
      await s.message(/committed [0-9a-f]+: Docs: the line the agent/, 8000);
      s.expect(count() === commits + 1, "one commit more");
      s.expect(
        git(s, KESTREL, "log", "-1", "--format=%s").out.trim() === "Docs: the line the agent added",
        "its message",
      );
      // Trusted: the amend's editor (the palette's, as the view's shift+c) says nothing of hooks; the message
      // changed, no commit more.
      await s.ex("trust");
      await s.message("trusted ~/work/kestrel");
      await s.keys(":");
      await s.type("Amend the last commit");
      await s.keys("enter");
      await s.see("# Amending the last commit: 0 files staged.");
      await s.notSee("This root isn't trusted", 500);
      await s.keys("A");
      await s.type(", amended");
      await s.keys("escape", "ctrl+s");
      await s.message(/amended [0-9a-f]+: Docs: the line the agent/, 8000); // the box wraps the rest
      s.expect(
        git(s, KESTREL, "log", "-1", "--format=%s").out.trim() === "Docs: the line the agent added, amended",
        "its message amended",
      );
      s.expect(count() === commits + 1, "amended, no commit more");
      await s.ex("untrust");
      await s.message("~/work/kestrel kept safe");
    },
  },
  {
    area: "links-and-files",
    name: "git: branches — one checked out, a new one made from here",
    covers: { cases: ["git"], commands: ["git.branches"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      await s.ex("Branches");
      await s.see(/Branches \(\d+\) — enter: check one out/);
      await s.see("A new branch from here…");
      await s.type("cleanup");
      await s.keys("enter");
      await s.status(/ · cleanup\/remove-legacy /, 5000);
      s.expect(git(s, KESTREL, "branch", "--show-current").out.trim() === "cleanup/remove-legacy", "checked out");
      await s.ex("Branches");
      await s.type("A new branch");
      await s.keys("enter");
      await s.see("new branch:");
      await s.type("sam/readme-status");
      await s.keys("enter");
      await s.status(/ · sam\/readme-status /, 5000);
      s.expect(git(s, KESTREL, "branch", "--show-current").out.trim() === "sam/readme-status", "made, and on it");
    },
  },
  {
    area: "links-and-files",
    name: "git: push, fetch and pull against a bare repository — the upstream asked for, the status line's ↓ and ↑, no hook in a vault not trusted",
    covers: { cases: ["git"], commands: ["git.push", "git.fetch", "git.pull"] },
    options: { home: true, startAt: "home/work/kestrel/README.md", setup: (s) => void bareOrigin(s, false) },
    run: async (s) => {
      // kestrel's own pre-push hook, the folder's code: in a vault not trusted, it never runs.
      const mark = join(s.dir, "pre-push-ran");
      const hook = s.path("~/work/kestrel/.git/hooks/pre-push");
      writeFileSync(hook, `#!/bin/sh\ntouch '${mark}'\n`);
      chmodSync(hook, 0o755);
      await s.status(/ · main {2}/);
      // Source control's keys: shift+p pushes, f fetches, p pulls.
      await leader(s, "g");
      await s.see("Source control");
      // main has no upstream: asked to push it to origin/main and track it there.
      await s.keys("shift+p");
      await s.see("main has no upstream. Push it to origin/main, and track it"); // the dialog wraps the rest
      await s.keys("y");
      await s.message("pushed main to origin/main", 8000);
      const bare = join(s.dir, "remote", "kestrel.git");
      s.expect(git(s, bare, "rev-parse", "main").out === git(s, KESTREL, "rev-parse", "HEAD").out, "main pushed");
      // Someone else pushes: fetched, the status line says main is one behind.
      pushedElsewhere(s, "README.md", "A line from another clone.\n");
      await s.keys("f");
      await s.message("fetched: main is 1 commit behind", 8000);
      await s.status(/ · main ↓1 {2}/, 5000);
      // Pulled, fast-forward: the file has their line, nothing behind.
      await s.keys("p");
      await s.message(/pulled: main fast-forwarded to [0-9a-f]+/, 8000);
      await s.file("~/work/kestrel/README.md", (t) => t.includes("A line from another clone."), "pulled");
      await s.status(/ · main {2}/, 5000);
      // An agent commits here: one ahead; pushed, in step again — the hook never ran.
      s.write(SYNC, `${s.read(SYNC)}\nA line the agent committed.\n`);
      gitOk(s, "the agent's commit", true, KESTREL, "commit", "-qam", "Docs: the agent's line");
      await s.status(/ · main ↑1 {2}/, 8000);
      await s.keys("shift+p");
      await s.message("pushed main to origin/main", 8000);
      await s.status(/ · main {2}/, 5000);
      s.expect(git(s, bare, "rev-parse", "main").out === git(s, KESTREL, "rev-parse", "HEAD").out, "pushed again");
      s.expect(!existsSync(mark), "no pre-push hook ran in a vault not trusted");
      s.expect((await lastMessage(s, "pushed main")).includes("this vault isn't trusted, so no hook ran"), "said so");
    },
  },
  {
    area: "links-and-files",
    name: "git: a pull where both sides moved — ↑1 ↓1, asked: nothing leaves both as they were, merge brings them together",
    covers: { cases: ["git"], commands: ["git.fetch", "git.pull"] },
    options: {
      home: true,
      startAt: "home/work/kestrel/README.md",
      setup: (s) => void bareOrigin(s, true),
      env: IDENTITY,
    },
    run: async (s) => {
      pushedElsewhere(s, "README.md", "A line from another clone.\n");
      s.write(SYNC, `${s.read(SYNC)}\nA line the agent committed.\n`);
      gitOk(s, "the agent's commit", true, KESTREL, "commit", "-qam", "Docs: the agent's line");
      const head = git(s, KESTREL, "rev-parse", "HEAD").out;
      // The palette's: :fetch, :pull.
      await s.ex("fetch");
      await s.status(/ · main ↑1 ↓1 {2}/, 8000);
      await s.ex("pull");
      await s.see("main and origin/main have both moved on — bring them together?", 8000);
      await s.see("(r) Rebase main onto origin/main");
      // Nothing: both as they were.
      await s.keys("n");
      await s.message("nothing pulled: main and origin/main");
      s.expect(git(s, KESTREL, "rev-parse", "HEAD").out === head, "HEAD where it was");
      s.expect(!s.read("~/work/kestrel/README.md").includes("A line from another clone."), "their line not here");
      await s.status(/ · main ↑1 ↓1 {2}/);
      // Merge: their line here, a merge commit, two ahead of origin/main now.
      await s.ex("pull");
      await s.see("(m) Merge origin/main into main", 8000);
      await s.keys("m");
      await s.message("pulled: merged origin/main into main", 8000);
      await s.file("~/work/kestrel/README.md", (t) => t.includes("A line from another clone."), "their line here");
      await s.status(/ · main ↑2 {2}/, 8000);
      s.expect(git(s, KESTREL, "log", "-1", "--format=%P").out.trim().split(" ").length === 2, "a merge commit");
      s.expect(
        (await lastMessage(s, "pulled: merged")).includes("this vault isn't trusted, so no hook ran"),
        "said so",
      );
    },
  },
  {
    area: "links-and-files",
    name: "git: stash — an agent's edit stashed with a message, listed, popped",
    covers: { cases: ["git"], commands: ["git.stash"] },
    options: { home: true, startAt: "home/work/kestrel/docs/sync.md" },
    run: async (s) => {
      const LINE = "A line the agent added.";
      s.write(SYNC, `${s.read(SYNC)}\n${LINE}\n`);
      await s.status("reloaded", 5000);
      // Source control's z; then the palette's :stash.
      await leader(s, "g");
      await s.see("Source control");
      await s.keys("z");
      await s.see("Stashes (0) — enter: pop, apply or drop one");
      await s.see("Stash the changes, untracked files too…");
      await s.keys("enter");
      await s.see("stash message:");
      await s.type("wip: the agent's line");
      await s.keys("enter");
      await s.message("stashed: wip: the agent's line", 8000);
      await s.file(SYNC, (t) => !t.includes(LINE), "the file back as committed");
      // Listed after the ways to stash; enter on it, then pop: the line back.
      await s.ex("stash");
      await s.see("stash@{0}  On main: wip: the agent's line");
      await s.keys("down", "down", "enter");
      await s.see("Pop it");
      await s.see("Drop it…");
      await s.keys("enter");
      await s.message("popped stash@{0}", 8000);
      await s.file(SYNC, (t) => t.includes(LINE), "the line back");
      s.expect(git(s, KESTREL, "stash", "list").out.trim() === "", "the stash gone from the list");
    },
  },
  {
    area: "links-and-files",
    name: "git: a remote that asks for a password fails at once, in git's words, never waiting for one",
    covers: { cases: ["git"], commands: ["git.fetch"] },
    // No system config's credential helper: the remote's question goes to git's own prompt, which never comes.
    options: { home: true, startAt: "home/work/kestrel/README.md", env: { GIT_CONFIG_NOSYSTEM: "1" } },
    run: async (s) => {
      // A remote that wants a login, on this machine: every request answered 401.
      const server = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: () => new Response("log in", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="kestrel"' } }),
      });
      try {
        gitOk(
          s,
          "origin over http",
          true,
          KESTREL,
          "remote",
          "set-url",
          "origin",
          `http://127.0.0.1:${server.port}/k.git`,
        );
        await s.ex("fetch");
        await s.message("could not read Username", 8000);
        // git's own prompt never asked: it says so (in a terminal, without it, git would wait at its question).
        const said = await lastMessage(s, "could not read Username");
        s.expect(said.includes("terminal prompts disabled"), `git told not to prompt: ${said}`);
        s.expect(said.includes("git in a terminal can log in (git fetch)"), "the hint: git in a terminal can log in");
      } finally {
        server.stop(true);
      }
    },
  },
  {
    area: "links-and-files",
    name: "git: who changed this line, and this file's history through its rename — a version read as it was",
    covers: { cases: ["git", "links/git"], commands: ["git.blame", "git.history"] },
    options: { home: true, startAt: "home/work/kestrel/docs/runbooks/sync-queue.md" },
    run: async (s) => {
      await s.ex("Who changed this line");
      await s.see(/line 1, last changed in [0-9a-f]{8}/, 8000);
      await s.keys("escape");
      // The history follows the file from before it moved next to the other runbooks.
      await s.ex("This file's history");
      await s.see(/docs\/runbooks\/sync-queue\.md — \d+ commits: enter, read it or its diff to now/, 8000);
      await s.see("as docs/runbook-sync.md");
      // up from the newest: the oldest, from before the move.
      await s.keys("up", "enter");
      await s.see("Read it as it was");
      await s.see("Its diff to the text now");
      await s.keys("enter");
      await s.see(/docs\/runbook-sync\.md at [0-9a-f]{7} \(\d{4}-\d\d-\d\d\), read-only/, 5000);
    },
  },
  {
    area: "links-and-files",
    name: "git: the gutter's changes — ] c and [ c go to them, Preview the change shows one, Undo the change undoes it",
    covers: {
      cases: ["git"],
      commands: ["git.change_next", "git.change_prev", "git.change_preview", "git.change_undo"],
    },
    options: { home: true, startAt: "home/work/kestrel/docs/sync.md" },
    run: async (s) => {
      // An agent's edit: a line changed near the top, one added at the end.
      const was = s.read(SYNC);
      s.write(
        SYNC,
        `${was.replace("How an edit gets from one device to the others.", "How an edit travels between devices.")}\nA line the agent added.\n`,
      );
      await s.status("reloaded", 5000);
      await s.keys("g", "g");
      await moveTo(s, ["]", "c"], (l) => l > 1, "] c: the first change");
      const first = pos(s).line;
      await moveTo(s, ["]", "c"], (l) => l > first, "] c: the next");
      const last = pos(s).line;
      await moveTo(s, ["[", "c"], (l) => l === first, "[ c: back to the first");
      // Its diff, against what's staged.
      await s.ex("Preview the change");
      await s.see(`line ${first}, against what's staged`);
      await s.see("+How an edit travels between devices.");
      await s.keys("escape");
      // Undone: its lines as staged, put back; unsaved, one undo step.
      await s.ex("Undo the change");
      await s.message(`the change at line ${first} undone, as staged (unsaved)`);
      await s.see("How an edit gets from one device to the others.");
      await s.status("unsaved");
      s.expect(last > first, "two changes");
    },
  },
  {
    area: "links-and-files",
    name: "git: the gutter's signs where [git] signs_at puts them — before the line numbers, at the window's right edge, against the text — in softer colours of their own",
    covers: { cases: ["git", "config"], commands: [] },
    options: {
      home: true,
      startAt: "home/work/kestrel/docs/sync.md",
      config: '[git]\nsigns_at = "gutter_left"\n',
    },
    run: async (s) => {
      const NOW = "How an edit travels between devices.";
      s.write(SYNC, s.read(SYNC).replace("How an edit gets from one device to the others.", NOW));
      await s.status("reloaded", 5000);
      /** The changed row (line 3): the text before its words, the text after, and its sign's colour. */
      const row = () => {
        const y = s.rowOf(NOW);
        const r = s.screen()[y] ?? "";
        const at = r.indexOf("▎", r.indexOf("┃") + 1);
        let n = 0;
        let fg: string | null = null;
        for (const run of s.runs()[y] ?? []) {
          if (at >= n && at < n + run.text.length) fg = run.fg;
          n += run.text.length;
        }
        const t = r.indexOf(NOW);
        return { before: r.slice(0, t), after: r.slice(t + NOW.length), fg: fg?.toLowerCase() };
      };
      const soft = themeFg("tokyo-night", "git_sign_change");
      s.expect(soft !== themeFg("tokyo-night", "git_modified"), "a colour of their own, not the explorer's");
      // Before the line numbers, in the gutter's first column.
      await s.until(() => /▎ *3 +$/.test(row().before), 5000, "the sign before line 3's number");
      s.expect(row().fg === soft, `the sign in its own colour (${row().fg}, not ${soft})`);
      // Rewritten while it runs: at the window's right edge, after the text.
      const file = join(s.dir, "config", "slipbox", "config.toml");
      writeFileSync(file, readFileSync(file, "utf8").replace('"gutter_left"', '"window_right"'));
      await s.message("config reloaded (file changed)", 5000);
      await s.until(
        () =>
          !row()
            .before.slice(row().before.indexOf("┃") + 1)
            .includes("▎") && row().after.includes("▎"),
        5000,
        "the sign after the text, at the window's edge",
      );
      // Against the text, after the line number: where they were before the setting.
      writeFileSync(file, readFileSync(file, "utf8").replace('"window_right"', '"gutter_right"'));
      await s.message("config reloaded (file changed)", 5000);
      await s.until(() => / 3 ▎$/.test(row().before), 5000, "the sign between line 3's number and its text");
      s.expect(row().fg === soft, "still its own colour");
    },
  },
];

const NOTES: Check[] = [
  {
    area: "links-and-files",
    name: "notes: :w, :wa, :w! and :e! — saved, all saved, saved over a file changed on disk, reverted; space n c resolves",
    covers: {
      cases: ["save", "conflict"],
      commands: ["note.save", "note.save_all", "note.save_force", "note.revert", "note.resolve", "note.open"],
    },
    options: { open: "meetings/2026-09-14-weekly.md" },
    run: async (s) => {
      const MEETING = "meetings/2026-09-14-weekly.md";
      // :w writes this note.
      await leader(s, "n", "v");
      await s.keys("G", "o");
      await s.type("Saved with :w.");
      await s.keys("escape");
      await s.ex("w");
      await s.file(MEETING, (t) => t.includes("Saved with :w."), ":w wrote it");
      // :wa writes every note changed, open or not.
      await s.keys("o");
      await s.type("Saved with :wa, here.");
      await s.keys("escape");
      await s.ex("e people/kenji-mori.md");
      await opened(s, "people/kenji-mori.md");
      // The window is in source mode still.
      await s.status("SOURCE");
      await s.keys("G", "o");
      await s.type("Saved with :wa, there.");
      await s.keys("escape");
      await s.ex("wa");
      await s.file(MEETING, (t) => t.includes("Saved with :wa, here."), ":wa wrote the first");
      await s.file("people/kenji-mori.md", (t) => t.includes("Saved with :wa, there."), ":wa wrote the second");
      // Changed on disk while changed here: the prompt; space n c brings it back; :w! writes over theirs.
      await s.keys("o");
      await s.type("mine");
      await s.keys("escape");
      s.write("people/kenji-mori.md", `${s.read("people/kenji-mori.md")}\ntheirs\n`);
      await s.see("(l) Load theirs", 5000);
      await s.keys("escape");
      await s.notSee("(l) Load theirs");
      await leader(s, "n", "c");
      await s.see("(l) Load theirs");
      await s.keys("escape");
      await s.ex("w!");
      await s.file("people/kenji-mori.md", (t) => t.includes("mine") && !t.includes("theirs"), "yours over theirs");
      // :e! drops what's typed: the file as it is.
      await s.keys("o");
      await s.type("unsaved");
      await s.keys("escape");
      await s.ex("e!");
      await s.until(() => !s.statusLine().includes("unsaved"), 3000, "the changes dropped");
      s.expect(!s.read("people/kenji-mori.md").includes("unsaved"), "e! wrote nothing");
    },
  },
  {
    area: "links-and-files",
    name: "notes: ctrl+n makes a note beside this one, typed into; ctrl+shift+n a folder; space n r reads it again",
    covers: { cases: ["new-note"], commands: ["note.create", "folder.create", "note.reload"] },
    options: { open: "people/kenji-mori.md" },
    run: async (s) => {
      await s.keys("ctrl+n");
      await s.see("new note in people/");
      await s.type("visitors-2026");
      await s.keys("enter");
      await opened(s, "people/visitors-2026.md");
      await s.type("Kenji, and the school in October.");
      await s.keys("escape", "ctrl+s");
      await s.file(
        "people/visitors-2026.md",
        (t) => t.startsWith("# visitors-2026") && t.includes("Kenji, and the school in October."),
        "the note made, its title and what was typed",
      );
      await s.keys("ctrl+shift+n");
      await s.see("new folder in people/");
      await s.type("archive");
      await s.keys("enter");
      await s.until(() => s.exists("people/archive"), 3000, "the folder made");
      // An outside write, read again by hand (the watcher would anyway).
      s.write("people/visitors-2026.md", "# visitors-2026\n\nRewritten by an agent.\n");
      await leader(s, "n", "r");
      await s.see("Rewritten by an agent.", 5000);
    },
  },
  {
    area: "links-and-files",
    name: "notes: space n e hands the note to your editor and comes back; space n s sends it to a running one",
    covers: { cases: ["notes"], commands: ["note.edit", "note.send", "note.send_pick"] },
    // Each editor leaves a file behind, so the check is that it really ran, with the note's path.
    options: {
      config: `[editor]\ncommand = "sh -c 'echo $0 > $1' {file} {vault}/ran-edit"\nremote = ["sh -c 'echo $0 > $1' {file} {vault}/ran-send"]\n`,
    },
    run: async (s) => {
      await leader(s, "n", "e");
      await opened(s, "home.md");
      await s.until(() => s.exists("ran-edit"), 5000, "the editor to run");
      s.expect(s.read("ran-edit").trim().endsWith("home.md"), "the editor got the note");
      await leader(s, "n", "s");
      await s.until(() => s.exists("ran-send"), 5000, "the remote editor to run");
      s.expect(s.read("ran-send").trim().endsWith("home.md"), "the remote editor got the note");
      // space n p picks which running nvim when the remote names a {server}; this one names none: sent again.
      rmSync(s.path("ran-send"));
      await leader(s, "n", "p");
      await s.until(() => s.exists("ran-send"), 5000, "the remote editor to run again");
      await s.message("sent to sh at line 1");
    },
  },
  {
    area: "links-and-files",
    name: "notes: exported — this note as Markdown beside it; two notes as one, in the order picked",
    covers: { cases: ["notes"], commands: ["note.export", "note.export_many"] },
    run: async (s) => {
      await leader(s, "n", "o");
      await s.see("Export home.md as");
      await s.type("markdown");
      await s.keys("enter");
      await s.see("Name: home.export.md");
      await s.keys("enter");
      await s.until(() => s.exists("home.export.md"), 15000, "home.export.md written");
      await s.message("exported home.md");
      // Two notes, this one first.
      await leader(s, "n", "shift+o");
      await s.see("Notes to export, in order — 1 picked");
      await s.type("about-this");
      await s.see("about-this-vault.md");
      await s.keys("down", "enter");
      await s.see("Notes to export, in order — 2 picked");
      await s.keys("up", "enter");
      await s.see("Export 2 notes as");
      await s.type("markdown");
      await s.keys("enter");
      await s.see("Name: home.export.md");
      await s.keys("ctrl+u");
      await s.type("both.md");
      await s.keys("enter");
      await s.until(() => s.exists("both.md"), 15000, "both.md written");
      const md = s.read("both.md");
      const [home, about] = [md.indexOf("# Halden Ridge Observatory"), md.indexOf("# About this vault")];
      s.expect(home > 0 && about > home, "both chapters, home's first");
    },
  },
  {
    area: "links-and-files",
    name: "notes: an export cancelled — a long note as a PDF, stopped from the palette before it's written",
    covers: { commands: ["note.export_cancel"] },
    options: {
      open: "long.md",
      // Long enough that its PDF takes seconds: the cancel comes first.
      setup: (s) =>
        s.write(
          "long.md",
          `# Long\n\n${Array.from({ length: 24_000 }, (_, i) => `Paragraph ${i} of a long note, a while as a PDF.\n`).join("\n")}`,
        ),
    },
    run: async (s) => {
      await s.keys(":");
      await s.type("Cancel export");
      await s.keys("enter");
      await s.message("no export is running");
      await leader(s, "n", "o");
      await s.see("Export long.md as");
      await s.type("pdf");
      await s.keys("enter");
      await s.see("Name: long.pdf");
      await s.keys("enter");
      await s.keys(":");
      await s.type("Cancel export");
      await s.keys("enter");
      await s.message("export cancelled");
      s.expect(!s.exists("long.pdf"), "the PDF not written");
    },
  },
  {
    area: "links-and-files",
    name: "info: the folder's own window; a note's properties edited in theirs, written back",
    covers: { cases: ["links/state"], commands: ["vault.info", "note.properties"] },
    options: { open: "people/kenji-mori.md" },
    run: async (s) => {
      await leader(s, "v", "i");
      await s.see(s.vault);
      await s.keys("escape");
      await leader(s, "n", "shift+p");
      await s.see("Properties — people/kenji-mori.md (YAML)");
      await s.keys("shift+g", "o");
      await s.type("status: visiting");
      await s.keys("escape", "escape");
      await s.message("properties written");
      await s.file(
        "people/kenji-mori.md",
        (t) => t.includes("status: visiting\n---"),
        "the property in the frontmatter",
      );
    },
  },
];

/** The peek's title, `kestrel › docs/architecture.md`: the column it starts at, -1 while no peek shows it. */
function peekTitleAt(s: Session, title: string): number {
  const row = s.screen().find((r) => r.includes(title));
  return row ? [...row].join("").indexOf(title) : -1;
}

/** A peek's hint, in its bottom border, while one is open. */
export const PEEK_HINT = "o go there · t keep as a tab";

const PEEK: Check[] = [
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
      await s.status(/ notes .*kestrel: docs\/architecture\.md/);
      // Its backlinks: kestrel has no index here yet, so how to see them.
      await s.keys("shift+g");
      await s.see("kestrel has no index here yet — o goes there, and finds them.");
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
      await s.status(/ notes .*kestrel: docs\/architecture\.md/);
      await s.keys("i");
      await s.message("read-only here: kestrel's");
      // o: from the note's tab, peeked at again, gone into — kestrel's own tabs; ctrl+o, back in notes.
      await s.keys("g", "t");
      await opened(s, "index.md");
      await s.keys("enter");
      await s.see(title, 5000);
      await s.keys("o");
      await s.status(/kestrel · main +‹ docs\/architecture\.md/, 5000);
      // Indexed there: its backlinks, notes' among them, now in a peek from notes.
      await leader(s, "l", "b");
      await s.see("~/notes/index.md", 10000);
      await s.keys("escape");
      await s.keys("ctrl+o");
      await s.status(/ notes .*index\.md/, 5000);
      await follow(s, ARCHITECTURE);
      await s.see(title, 5000);
      await s.keys("shift+g");
      await s.see(/Linked from \(\d+\):/);
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
      await s.status(/ notes /);
      // This vault's: the peek closes, the note opens in the tabs, as usual.
      await follow(s, "sync-rewrite in his");
      await s.notSee(PEEK_HINT, 5000);
      await opened(s, "projects/sync-rewrite.md");
      await s.status(/ notes /);
      // A third vault's, from product's PRD peeked at: the peek moves on, into kestrel.
      await s.restart({ startAt: "home/notes/meetings/2026-09-05-feedback-synthesis.md" });
      await follow(s, "the pricing section");
      await s.see("product › prd/route-sharing.md", 5000);
      await follow(s, "the feature doc");
      await s.see("kestrel › docs/features/route-sharing.md", 5000);
      await s.status(/ notes /);
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
      await s.status(/kestrel · main +‹ notes: index\.md/);
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
      await s.status(/ outreach .*index\.md/);
      s.expect(!s.text().includes(PEEK_HINT), "no peek on the way");
    },
  },
];

export const LINKS_AND_FILES: Check[] = [...LINKS, ...ROOTS, ...NAMED, ...FILES, ...RENAMES, ...GIT, ...NOTES, ...PEEK];

// GIT's review, merge screen and rebase have their checks in source-control.ts, with the git panel's.
export const LEFT_OUT_LINKS_AND_FILES: LeftOut = {
  commands: {
    "vault.links":
      "its terminal check comes with the next pass of the links' checks; tests/tui.test.ts lists and forgets meanwhile",
  },
};
