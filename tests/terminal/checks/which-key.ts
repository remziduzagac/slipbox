import type { Check } from "../check.ts";
import { sleep } from "../session.ts";

export const WHICH_KEY: Check[] = [
  // --- which-key ------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "which-key: the leader's groups at once, a prefix's entries after its delay; backspace goes up, esc closes",
    covers: { cases: ["which-key"] },
    options: {
      size: { cols: 120, rows: 30 },
      config: '[input]\nwhich_key_delay_ms = 1500\n[groups]\n"leader l" = "LINKS: everything about links"\n',
    },
    run: async (s) => {
      // The leader: its groups at once, delay or not.
      s.term.key("space");
      await s.until(() => s.rowOf("+history") >= 0 && s.rowOf("+session") >= 0, 1000, "the leader's groups at once");
      await s.see("everything about links");
      await s.see("About slipbox");
      await s.see("Background work");
      // Into find's group: its entries; backspace back up to the groups; esc closes.
      await s.keys("f");
      await s.see("Find in every note");
      await s.see("Search here");
      await s.keys("backspace");
      await s.until(
        () => s.rowOf("+history") >= 0 && s.rowOf("Find in every note") < 0,
        3000,
        "backspace up to the groups",
      );
      await s.keys("escape");
      await s.until(() => s.rowOf("+history") < 0, 3000, "esc closing the popup");
      // g, another prefix: nothing until its delay (1.5 s here), then its entries.
      s.term.key("g");
      await sleep(400); // well inside the delay: a popup now would be early
      s.expect(s.rowOf("g › go") < 0, "g's popup before its delay");
      await s.see("g › go", 4000);
      await s.see("Top of note");
      await s.keys("escape");
      await s.notSee("g › go");
    },
  },
  {
    area: "navigating",
    name: "which-key: z, [ and ] list every key under them, each titled with what it holds",
    covers: { cases: ["which-key"] },
    options: { config: "[input]\nwhich_key_delay_ms = 100\n" },
    run: async (s) => {
      /** The popup's entry for `key`: a row with the key, then its name. */
      const entry = (key: string, name: string) =>
        new RegExp(`(^|\\s)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(→\\s+)?${name}`);
      const popup = async (prefix: string, title: string, entries: [string, string][]) => {
        s.term.key(prefix);
        await s.see(title);
        for (const [key, name] of entries) await s.see(entry(key, name));
        await s.keys("escape");
        await s.notSee(title);
      };
      // The title: the keys, the group's name and its explanation, whose start fits any terminal.
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
];
