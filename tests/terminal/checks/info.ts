// Note and vault information, properties and messages.

import { type Check, leader, open } from "../check.ts";

export const INFO: Check[] = [
  {
    area: "reading",
    name: "info: the Info view — the file's root, properties, backlinks and tags; toggled from the palette",
    covers: { cases: ["info"], commands: ["note.info", "info.toggle"] },
    run: async (s) => {
      // The Info view (3.19): the file on screen, in the right panel — its vault, properties, links.
      await open(s, "kenji-mori");
      await leader(s, "n", "i");
      await s.status("INFO");
      await s.see(/vault +halden/);
      await s.see("Properties");
      await s.see(/building +Workshop/);
      await s.see(/backlinks +\d+/);
      // A tag's row: its notes.
      await s.keys("shift+g");
      await s.until(() => s.text().includes("#people") && s.text().includes("#visiting"), 3000, "its tags, both");
      // Its toggle, from the palette: hidden, then shown again.
      await s.keys("escape");
      await s.keys(":");
      await s.type("Show or hide the Info");
      await s.keys("enter");
      await s.until(() => !/\bINFO\b/.test(s.text()), 3000, "the Info hidden");
      await s.keys(":");
      await s.type("Show or hide the Info");
      await s.keys("enter");
      await s.see("Properties");
    },
  },

  {
    area: "reading",
    name: "properties: space n shift+p edits the frontmatter's YAML in a floating editor, written back, the Info view updated",
    covers: { cases: ["properties", "yaml-frontmatter"], commands: ["note.properties", "note.info"] },
    run: async (s) => {
      await open(s, "kenji-mori");
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
      await leader(s, "n", "i");
      await s.see(/status +visiting/);
    },
  },

  {
    area: "reading",
    name: "info: the vault's info in its own window; reindex said; the config reloaded; messages; help",
    covers: {
      cases: ["info"],
      commands: ["vault.info", "vault.reindex", "config.reload", "messages.open", "help.open"],
    },
    run: async (s) => {
      await leader(s, "v", "i");
      await s.see(s.vault);
      await s.keys("escape");
      await leader(s, "v", "r");
      await s.message(/reindexed \d+ notes/);
      await leader(s, "v", "c");
      await leader(s, "m");
      await s.see("Messages");
      await s.see(/reindexed \d+ notes/);
      await s.keys("escape");
      await s.keys("?");
      await s.see("Keys — type to filter");
      await s.keys("escape");
    },
  },
];
