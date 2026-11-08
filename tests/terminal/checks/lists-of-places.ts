import { type Check, leader, opened, signed } from "../check.ts";
import type { Session } from "../session.ts";
import { onto } from "../support/outside-and-code.ts";
import { tab } from "../support/vaults.ts";
import { SHARE, TS_CONFIG } from "./language-servers.ts";

/** The preview's title in its frame's top border, `┌─ <place> ─`: its row and column, or null while it isn't drawn. */
function previewTitle(s: Session, place: RegExp): { row: number; col: number } | null {
  const frame = new RegExp(`┌─ ${place.source} ─`);
  const row = s.rowOf(frame);
  if (row < 0) return null;
  const line = [...s.screen()[row]!].join("");
  return { row, col: Bun.stringWidth(line.slice(0, line.search(frame))) };
}

/** The list's bottom border, where its keys are: `ctrl+t hide · alt+enter where`. */
const keysRow = (s: Session) => s.rowOf(/ctrl\+t (hide|show)/);

/**
 * The preview of `place` drawn where the screen's width puts it: beside the list from `ui.narrow_width` (90) on, its
 * frame's top the list's; narrower, under the list's bottom border.
 */
async function previewed(s: Session, place: RegExp, wide: boolean, timeout = 5000): Promise<void> {
  await s.until(
    () => {
      const at = previewTitle(s, place);
      if (!at) return false;
      return wide ? at.row < keysRow(s) && at.col > s.cols / 3 : at.row === keysRow(s) + 1 && at.col < 10;
    },
    timeout,
    `the preview of ${place.source} ${wide ? "beside the list" : "under it"}`,
  );
}

/** Whether `word` is marked in the preview beside the list, as a link under the cursor is: a run of its own, bold, on a
 *  background of its own. */
function marked(s: Session, word: string): boolean {
  return s.runs().some((row) => {
    let col = 0;
    return row.some((r) => {
      const at = col;
      col += Bun.stringWidth(r.text);
      return r.text === word && r.bold && r.bg !== null && at > s.cols / 3;
    });
  });
}

/** A click (SGR's reports, as a terminal sends them) on the first place `needle` shows. */
async function click(s: Session, needle: string): Promise<void> {
  const row = s.rowOf(needle);
  s.expect(row >= 0, `${needle} on screen to click`);
  const line = [...s.screen()[row]!].join("");
  const x = Bun.stringWidth(line.slice(0, line.indexOf(needle))) + 1;
  await s.send(`\x1b[<0;${x};${row + 1}M`);
  await s.send(`\x1b[<0;${x};${row + 1}m`);
}

export const LISTS_OF_PLACES: Check[] = [
  // --- lists of places: the preview, where a pick opens, the last list again -----------------------
  {
    area: "navigating",
    name: "lists of places: the switcher, search, find in every note, backlinks and links preview their row's place, beside the list at 120 columns, under it at 80; ctrl+t and a click hide it",
    covers: {
      cases: ["lists-prompts", "switcher", "search", "vault-find"],
      commands: ["switcher.open", "search.open", "find.vault", "backlinks.open", "links.open"],
    },
    options: { open: "projects/dome-refit.md", size: { cols: 120, rows: 40 } },
    run: async (s) => {
      for (const wide of [true, false]) {
        if (!wide) await s.resize(80, 40);
        await s.keys("ctrl+p");
        await s.type("operations handbook");
        await previewed(s, /handbook\/operations-handbook\.md/, wide);
        await s.keys("escape");
        await leader(s, "f", "s");
        await s.type("dome shutter");
        await previewed(s, /projects\/dome-refit\.md:\d+/, wide);
        await s.keys("escape");
        // Read off the keys: its match's line, in the preview's window as in the note.
        await s.keys("ctrl+shift+f");
        await s.type("jammed twice");
        await s.keys("enter");
        await previewed(s, /projects\/dome-refit\.md:14/, wide);
        await s.keys("escape");
        await leader(s, "l", "b");
        await previewed(s, /home\.md:12/, wide);
        await s.keys("escape");
        await leader(s, "l", "l");
        await previewed(s, /logs\/observing-log-2026\.md/, wide);
        await s.keys("escape");
      }
      // ctrl+t hides it, for the next list too; `ctrl+t show` clicked shows it again.
      await s.resize(120, 40);
      await leader(s, "l", "b");
      await previewed(s, /home\.md:12/, true);
      await s.keys("ctrl+t");
      await s.until(() => !previewTitle(s, /home\.md:12/), 3000, "ctrl+t: the preview hidden");
      await s.see("ctrl+t show");
      await s.keys("escape", "ctrl+p");
      await s.see("ctrl+t show");
      await click(s, "ctrl+t show");
      await s.see("ctrl+t hide");
      await previewed(s, /\S+/, true);
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "lists of places: alt+enter opens the pick here, in the split or in a new tab, the palette's way too; space ' brings the last list back",
    covers: {
      cases: ["lists-prompts", "switcher", "tabs"],
      commands: ["list.open_where", "list.resume", "switcher.open"],
    },
    options: { size: { cols: 120, rows: 40 } },
    run: async (s) => {
      const where = async (query: string, asked: string, key: string) => {
        await s.keys("ctrl+p");
        await s.type(query);
        await s.see(`│ ${asked}`);
        await s.keys("alt+enter");
        await s.see(`Open ${asked} where?`);
        await s.keys(key);
        await s.notSee(`Open ${asked} where?`);
      };
      await where("dome refit", "projects/dome-refit.md", "h");
      await opened(s, "projects/dome-refit.md");
      // The split's two windows, their headers side by side.
      const split = () => s.rowOf(/projects\/dome-refit.*handbook\/writing-gu/) >= 0;
      s.expect(!split(), "here: one window still");
      await where("writing guide", "handbook/writing-guide.md", "s");
      await s.until(split, 3000, "s: the split, the guide in it");
      await opened(s, "handbook/writing-guide.md");
      // Narrower, the same: a new tab.
      await s.resize(80, 40);
      await where("survey variable", "projects/variable-star-survey.md", "t");
      await s.see(tab(2, "variable-star-survey.md"));
      // esc goes back to the list; space ' brings the last one back as it was, its query kept.
      await s.keys("ctrl+p");
      await s.type("kenji");
      await s.see("│ people/kenji-mori.md");
      await s.keys("alt+enter");
      await s.see("Open people/kenji-mori.md where?");
      await s.keys("escape");
      await s.see("│ people/kenji-mori.md");
      await s.keys("escape");
      await s.notSee("│ people/kenji-mori.md");
      await leader(s, "'");
      await s.see(/› kenji/);
      await s.see("│ people/kenji-mori.md");
      await s.keys("escape");
      // From the palette, for a terminal that keeps alt+enter: the last list's pick, asked where.
      await s.keys(":");
      await s.type("Open the pick where");
      await s.keys("enter");
      await s.see("Open people/kenji-mori.md where?");
      await s.keys("t");
      await s.see(tab(3, "kenji-mori.md"));
    },
  },
  {
    area: "outside-and-code",
    name: "lists of places: a server's references preview each use, the name marked, beside the list at 120 columns, under it at 80",
    covers: { cases: ["lsp", "lists-prompts"], commands: ["lsp.references"] },
    options: { home: true, startAt: SHARE, config: TS_CONFIG, size: { cols: 120, rows: 40 } },
    run: async (s) => {
      await s.status(signed("{error} 1"), 15000); // the server has read the file
      await onto(s, "formatKm(km");
      await s.keys("g", "r");
      await s.see(/2 references/, 10000);
      await previewed(s, /\S*share\.ts:23/, true);
      await s.until(() => marked(s, "formatKm"), 3000, "formatKm marked in the preview");
      await s.keys("down");
      await previewed(s, /\S*format\.mts:14/, true);
      await s.resize(80, 40);
      await previewed(s, /\S*format\.mts:14/, false);
      await s.keys("escape");
    },
  },
];
