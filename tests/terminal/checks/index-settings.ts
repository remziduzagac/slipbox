import { type Check, HANDBOOK, leader, opened } from "../check.ts";
import { sleep } from "../session.ts";
import { toSource, configFile } from "../support/navigation.ts";

export const INDEX_SETTINGS: Check[] = [
  {
    area: "navigating",
    name: "config: mistakes are warnings in the messages, the rest applies; space v c reloads; a typo keeps the last good",
    covers: { cases: ["config", "ui"], commands: ["messages.open", "config.reload"] },
    options: {
      size: { cols: 140, rows: 34 },
      config: '[ui]\nline_numbers = false\nlines = "thick"\nsidebar_width = 7\nnosuch = 1\n',
    },
    run: async (s) => {
      /** One message in the list says all these words (the rows are cut, the file's path first: the count tells). */
      const said = async (words: string, count = / 1\/1 ┘/) => {
        await leader(s, "m");
        await s.see("Messages");
        await s.type(words);
        await s.see(count);
        await s.keys("escape");
        await s.notSee("Messages");
      };
      // Each mistake said; line numbers off all the same, as the rest of the file says.
      await said("unknown key ui.nosuch");
      await said("ui.sidebar_width must be between 8 and 200");
      await said("ui.lines must be one of light heavy");
      const numbered = () => /[│┃]\s+1\s+▌ Halden Ridge Observatory/.test(s.text());
      await s.see("▌ Halden Ridge Observatory");
      s.expect(!numbered(), "line numbers off, as the file says");
      // Fixed, and line numbers on: space v c reloads at once.
      const fixed = s
        .read(configFile(s))
        .replace(/^(lines|sidebar_width|nosuch) = .*\n/gm, "")
        .replace("line_numbers = false", "line_numbers = true");
      s.write(configFile(s), fixed);
      await leader(s, "v", "c");
      await s.until(numbered, 3000, "line numbers on after the reload");
      // A typo saved mid-edit (line numbers off in it too): said, and the last good settings kept.
      s.write(configFile(s), `${fixed.replace("line_numbers = true", "line_numbers = false")}\n[ui\n`);
      await leader(s, "v", "c");
      // Saved, the file is read again on its own too (polled): before space v c did, on a slow machine, and said by
      // each (#40).
      await said("Invalid TOML keeping what it said before", / 1\/[12] ┘/);
      s.expect(numbered(), "line numbers still on: the last good settings");
    },
  },
  {
    area: "navigating",
    name: "index: a note saved here is indexed again — its new link in the target's backlinks, its new word found",
    covers: { cases: ["index", "search"], commands: ["backlinks.open", "search.open", "note.save"] },
    options: { open: "people/kenji-mori.md", size: { cols: 140, rows: 34 } },
    run: async (s) => {
      await toSource(s);
      await s.keys("shift+g", "o");
      await s.type("See [the dome refit](../projects/dome-refit.md) and the quokkaline.");
      await s.keys("escape", "ctrl+s");
      await s.file("people/kenji-mori.md", (t) => t.includes("quokkaline"), "the note saved");
      await s.ex("e dome-refit");
      await s.status("dome-refit.md");
      await leader(s, "l", "b");
      await s.see(/Linking to dome-refit\.md/, 5000);
      await s.see(/people\/kenji-mori\.md\s+the dome refit/, 5000);
      await s.keys("escape");
      await leader(s, "f", "s");
      await s.type("quokkaline");
      await s.see(/"quokkaline" — 1 file/, 5000);
      await s.see("people/kenji-mori.md:");
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "settings: a [walk] setting that takes in a note open but left out — the vault's note at once, its link found, its backlink",
    covers: { cases: ["config", "index"], commands: ["config.reload", "links.open", "backlinks.open"] },
    options: {
      open: "parked/aside.md",
      config: '[walk]\nexclude = ["parked/"]\n',
      size: { cols: 140, rows: 34 },
      setup: (s) => {
        if (!s.exists("parked/aside.md"))
          s.write("parked/aside.md", "# Aside\n\nParked here, back to [home](../home.md).\n");
      },
    },
    run: async (s) => {
      await opened(s, "parked/aside.md");
      // Taken in: the walk no longer leaves parked/ out, the settings read again.
      s.write(configFile(s), s.read(configFile(s)).replace('exclude = ["parked/"]', "exclude = []"));
      await leader(s, "v", "c");
      await s.retry(
        async () => {
          if (s.rowOf("Links from") >= 0) await s.keys("escape");
          await leader(s, "l", "l");
        },
        () => s.rowOf("Links from aside.md") >= 0 && /\.\.\/home\.md\s+resolved/.test(s.text()),
        "aside.md's link to home.md, resolved",
        1000,
        10_000,
      );
      await s.keys("escape");
      await s.ex("e home.md");
      await opened(s, "home.md");
      await leader(s, "l", "b");
      await s.see(/Linking to home\.md/, 5000);
      await s.see("parked/aside.md");
    },
  },
  {
    area: "navigating",
    name: "settings: a note open, then left out by the vault's [walk], changed by an agent — read again, never indexed again",
    covers: { cases: ["config", "index", "watching"], commands: ["config.reload", "search.open"] },
    options: {
      open: "parked/kept.md",
      size: { cols: 140, rows: 34 },
      setup: (s) => {
        if (!s.exists("parked/kept.md")) s.write("parked/kept.md", "# Kept\n\nParked for now.\n");
      },
    },
    run: async (s) => {
      await opened(s, "parked/kept.md");
      // The vault's own [walk] leaves parked/ out now (it comes before your config's).
      s.write(
        ".slipbox/config.toml",
        s.read(".slipbox/config.toml").replace(/^exclude = \[/m, 'exclude = ["parked/", '),
      );
      await leader(s, "v", "c");
      await s.message(/changed: .*walk/, 5000);
      // An agent rewrites it: the window reads it again, and the index doesn't take it back.
      s.write("parked/kept.md", "# Kept\n\nA quillwort note, now.\n");
      await s.see("A quillwort note, now.", 5000);
      await leader(s, "f", "s");
      await s.type("quillwort");
      await s.see(/"quillwort"/, 5000);
      await sleep(1000);
      await s.notSee("parked/kept.md:");
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "index: space v r with the watcher off — a note made since is indexed and searched, its backlink there",
    covers: { cases: ["index", "search"], commands: ["vault.reindex", "search.open", "backlinks.open"] },
    options: { open: "home.md", config: "[watch]\nenabled = false\n", size: { cols: 140, rows: 34 } },
    run: async (s) => {
      await s.status("home.md");
      // Written while nobody watches: unknown until the reindex.
      s.write("late.md", "# Late\n\nA zanzibar crossing, back to [home](home.md).\n");
      await leader(s, "v", "r");
      await s.message(/reindexed \d+ notes/, 5000);
      // Searched: the search index caught up with the reindex.
      await leader(s, "f", "s");
      await s.type("zanzibar");
      await s.see(/"zanzibar" — 1 file/, 5000);
      await s.see("late.md:");
      await s.keys("escape");
      await leader(s, "l", "b");
      await s.see(/Linking to home\.md/, 5000);
      await s.see("late.md");
      await s.keys("escape");
      // The note open, rewritten while nobody watches: read again by the next reindex.
      s.write("home.md", `${s.read("home.md")}\nA line an agent added.\n`);
      await leader(s, "v", "r");
      await s.message(/reindexed \d+ notes/, 5000);
      await s.keys("shift+g");
      await s.see("A line an agent added.", 5000);
    },
  },
  {
    area: "navigating",
    name: "find: replace in every note — ctrl+shift+h previews each change, enter makes them; space v shift+u undoes",
    covers: { cases: ["vault-find", "replace"], commands: ["find.replace_vault", "rename.undo"] },
    options: { size: { cols: 120, rows: 34 } },
    run: async (s) => {
      const count = (w: string) => s.read(HANDBOOK).split(w).length - 1;
      const corvids = count("Corvid");
      await s.keys("ctrl+shift+h");
      await s.see("replace in every note — find");
      await s.type("Corvid");
      await s.keys("enter");
      await s.see('replace "Corvid" in every note with');
      await s.type("Raven");
      await s.keys("enter");
      await s.see(/"Corvid" → "Raven": \d+ changes in \d+ files — enter: do it/, 5000);
      await s.see("handbook/operations-handbook.md:");
      s.expect(count("Raven") === 0, "nothing written while previewing");
      await s.keys("enter");
      await s.message(/replaced "Corvid" with "Raven"/);
      await s.until(() => count("Raven") === corvids && count("Corvid") === 0, 3000, "every Corvid replaced");
      await leader(s, "v", "shift+u");
      await s.see(/undo: "Raven" → "Corvid"/);
      await s.keys("enter");
      await s.until(() => count("Corvid") === corvids && count("Raven") === 0, 3000, "the replace undone");
    },
  },
];
