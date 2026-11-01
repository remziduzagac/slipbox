// Structured data files and their source view.

import { type Check, leader, moveTo, open, TOML } from "../check.ts";
import { edit, followLink, KESTREL } from "../support/reading.ts";

const INFRA = "home/work/infra/README.md";

export const DATA_FILES: Check[] = [
  {
    area: "reading",
    name: "data: TOML — keys lined up, a comment after its value, records as a table; a value's path followed and back",
    covers: { cases: ["toml", "data"], commands: ["link.follow", "history.back"] },
    options: { open: TOML },
    run: async (s) => {
      await s.see(/workers\s+3\s+# halved from 6/); // keys lined up, the comment after the value
      await s.see("QHY600M"); // [[telescope]] records as a table
      await s.status(/READ/);
      // A value that is a path is a link: find it, follow it, come back.
      await followLink(s, "pipeline-cookbook");
      await s.status("pipeline-cookbook.md");
      await s.keys("ctrl+o");
      await s.status("halley.toml");
    },
  },

  {
    area: "reading",
    name: "data: the lens edits one key of a TOML file on its own line; space n v shows the source",
    covers: { cases: ["data-modes"], commands: ["view.live", "view.source", "note.save"] },
    options: { open: TOML },
    run: async (s) => {
      await s.see("bias_frames");
      await s.keys("/");
      await s.type("bias_frames");
      await s.keys("enter", "escape");
      await leader(s, "n", "l");
      await s.status("LENS");
      await s.keys("A");
      await s.status("INSERT");
      await s.type("0");
      await s.keys("escape", "escape", "ctrl+s");
      await s.file(TOML, (t) => t.includes("bias_frames = 210"), "the lens edit saved");
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.see("bias_frames = 210");
    },
  },

  {
    area: "reading",
    name: "data: CSV as a table — a quoted field with doubled quotes; past 2,000 rows counted, source mode has every line",
    covers: { cases: ["csv"], commands: ["view.source"] },
    run: async (s) => {
      await open(s, "filters.csv");
      await s.see(/│ filter\s+│ telescope/);
      await s.see('"Aster pointing model"'); // a quoted field with "" in it
      // A big CSV: the first 2,000 rows drawn, the rest counted, all of them in source mode.
      await open(s, "photometry-2026.csv");
      await s.see(/│ date\s+│ utc/);
      await s.keys("G");
      await s.see("… 600 more rows");
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await moveTo(s, ["G"], (l) => l === 2601, "G to the CSV's last line in source mode");
    },
  },

  {
    area: "reading",
    name: "data: YAML — records as a table; nested maps a tree with guides at every depth, the breadcrumb following",
    covers: { cases: ["yaml"] },
    run: async (s) => {
      await open(s, "targets.yaml");
      await s.see(/│ SS Cyg\s+│ dwarf nova/);
      await open(s, "deploy.yaml");
      await s.see(/├─ 1\s*$/m);
      await s.see(/│  ├─ env/);
      await s.see(/│  │  ├─ ARCHIVE_ROOT\s+\/srv\/stacks/);
      await s.keys("/");
      await s.type("*probe"); // the api's health probe, line 22 (22G would count rows, not lines)
      await moveTo(s, ["enter", "escape"], (l) => l === 22, "find onto the api's health probe");
      await s.see(/containers\s*›\s*1\s*›\s*health/);
    },
  },

  {
    area: "reading",
    name: "data: JSON — a $ref's pointer followed to the row it names; INI keys lined up, a comment after its value",
    covers: { cases: ["json", "ini"], commands: ["link.follow"] },
    run: async (s) => {
      await open(s, "openapi.json");
      await followLink(s, "#/components/schemas/Frame");
      await s.until(() => /L5\d:/.test(s.statusLine()), 3000, "the cursor on the Frame schema's row (line 5x)");
      await open(s, "logging.ini");
      await s.see(/level\s+INFO\s+# DEBUG floods the disk/);
    },
  },

  {
    area: "reading",
    name: "data: a file that doesn't parse opens in source mode, said why — JSON and TOML alike",
    covers: { cases: ["data-modes", "toml", "json"] },
    options: { home: true, startAt: INFRA },
    run: async (s) => {
      await edit(s, "config/broken/unclosed-string.toml");
      await s.status("SOURCE");
      await s.message(/doesn't parse/);
      await s.restart({ startAt: "vault/home.md" });
      await open(s, "broken-config.json");
      await s.status("SOURCE");
      await s.message(/doesn't parse/);
      await s.see('"telescopes": ["Aster", "Brill"');
    },
  },

  {
    area: "reading",
    name: "data: Java's .properties — ! comments are comments, a value continued after a backslash one value; multi-document YAML a row each",
    covers: { cases: ["ini", "yaml", "samples-existing"] },
    options: { home: true, startAt: INFRA },
    run: async (s) => {
      await edit(s, "config/legacy-archive.properties");
      await s.status(/READ/);
      s.expect(!s.text().includes("doesn't parse"), "no parse error said");
      await s.see(/archive\.target\.bucket\s+kestrel-archive-eu\s+# Where the archive goes/);
      await s.see(
        /archive\.sources\s+\/var\/lib\/kestrel\/routes, \/var\/lib\/kestrel\/gpx-uploads, \/var\/lib\/kestrel\/offline-bundles, \/var\/lib\/kestrel\/exports/,
      );
      await edit(s, "k8s/api.yaml");
      await s.status(/READ/);
      await s.see(/document 1/);
      await s.see(/document 2/);
    },
  },

  {
    area: "reading",
    name: "data: an .env — export prefixes dropped, a quoted value unquoted, its comment after it",
    covers: { cases: ["ini", "classify"] },
    options: { home: true, startAt: INFRA },
    run: async (s) => {
      await edit(s, "config/prod.env");
      await s.status(/READ/);
      s.expect(!s.text().includes("doesn't parse"), "no parse error said");
      await s.see(/NODE_ENV\s+production/);
      await s.see(/TILE_ATTRIBUTION\s+\(c\) OpenStreetMap contributors/);
      await s.see(/SYNC_ENDPOINT\s+https:\/\/sync\.kestrel\.dev\/v2\s+# the worker/);
    },
  },

  {
    area: "reading",
    name: "data: JSON with comments and trailing commas renders; a 3,000-line lock file's end at once; 290 KB on one line a tree to its last entry",
    covers: { cases: ["json"] },
    options: { home: true, startAt: KESTREL },
    run: async (s) => {
      // kestrel's tsconfig.json has comments and trailing commas, as editors allow: it renders.
      await edit(s, "tsconfig.json");
      await s.status(/READ/);
      s.expect(!s.text().includes("doesn't parse"), "no parse error said");
      await s.see(/target\s+ES2022/);
      await s.see(/strict\s+true/);
      // A 3,248-line lock file: G at its end at once.
      await edit(s, "package-lock.json");
      await s.status(/READ/);
      await moveTo(s, ["G"], (l) => l > 3200, "G to the lock file's end");
      // A 290 KB JSON on one line (Downloads, a plain folder): a tree, its last route reached.
      await s.restart({ startAt: "home/Downloads/routes-export.min.json" });
      await s.status(/READ/);
      await s.see(/routes/);
      await s.keys("G");
      await s.see("Route 399 via the ridge road", 5000);
    },
  },
];
