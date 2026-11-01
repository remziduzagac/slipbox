// Code outlines, navigation and syntax diagnostics.

import { type Check, moveTo, opened, pos, signed } from "../check.ts";
import { crumb, edit, followLink, KESTREL, line, outlinePicker } from "../support/reading.ts";

export const CODE_FILES: Check[] = [
  {
    area: "reading",
    name: "code: Python's outline from its grammar, the breadcrumb inside a method; a comment's path:line followed and back",
    covers: { cases: ["code-py", "code-files"], commands: ["outline.pick", "link.follow", "history.back"] },
    // Source mode's: code opens in the code view by default, which checks of their own cover.
    options: { open: "software/halley/reduce.py", config: '[render]\ncode = "source"\n' },
    run: async (s) => {
      await s.status("SOURCE");
      await s.see("class Night:");
      // The outline is the file's definitions, nested; the picker lists each with its line beside it.
      await outlinePicker(s, "reduce.py");
      await s.see(/is_calibration\s+\d+/);
      await s.see("science");
      await s.keys("escape");
      await moveTo(s, ["4", "1", "G"], (l) => l === 41, "41G into Night.reduce");
      await s.see(/Night\s*›\s*reduce/); // the breadcrumb
      // A comment's `halley.toml:10`: enter opens the file at that line.
      await followLink(s, "halley.toml:10");
      await s.status("halley.toml");
      await s.keys("ctrl+o");
      await s.status("reduce.py");
    },
  },

  {
    area: "reading",
    name: "code: TypeScript's breadcrumb from its grammar; a comment's relative path followed",
    covers: { cases: ["code-ts"], commands: ["link.follow"] },
    options: { open: "software/nightjar/src/server.ts", config: '[render]\ncode = "source"\n' },
    run: async (s) => {
      await s.status("server.ts");
      await s.ex("40");
      await s.until(() => /FrameArchive\s*›\s*byNight/.test(s.text()), 5000, "the breadcrumb in FrameArchive.byNight");
      await followLink(s, "../openapi.json");
      await s.status("openapi.json");
    },
  },

  {
    area: "reading",
    name: "code: a syntax error counted on the status line, hidden while typing, back after",
    covers: { cases: ["code-py"], commands: ["note.open"] },
    options: { config: '[render]\ncode = "source"\n' },
    run: async (s) => {
      await s.ex("e scratch/half-written.py"); // code isn't in ctrl+p by default (files.show)
      await s.status("half-written.py");
      await s.status(signed("{error}"), 5000);
      await s.keys("G", "o");
      await s.status("INSERT");
      await s.until(() => !signed("{error}").test(s.statusLine()), 3000, "no error marks while typing");
      await s.keys("escape");
      await s.status(signed("{error}"), 5000);
    },
  },

  {
    area: "reading",
    name: "code: Go, Rust, Lua, shell, JavaScript and TSX — each outline from its grammar, the breadcrumb two levels in",
    covers: {
      cases: ["code-go", "code-rs", "code-lua", "code-sh", "code-js", "code-ts", "code-files"],
      commands: ["outline.pick", "note.open"],
    },
    options: { home: true, startAt: KESTREL },
    run: async (s) => {
      // Each file's outline from its grammar (loaded lazily, then drawn again): the heading picker lists a definition
      // with its line — a row the file's own text never has — and inside a nested definition the breadcrumb names
      // both levels.
      const files: [string, string, number, RegExp, number][] = [
        ["tools/uploader/main.go", "Map", 37, /§ .*Start/, 30],
        ["crates/route-engine/src/lib.rs", "heuristic", 94, /impl Point\s*›\s*new/, 45],
        ["scripts/dev/kestrel.lua", "Route:distance", 33, /Route:describe\s*›\s*pad/, 29],
        ["scripts/lib.sh", "tail_log", 30, /version_of\s*›\s*inner/, 16],
        ["src/legacy/app.js", "compare", 35, /Route\s*›\s*constructor/, 27],
        ["src/App.tsx", "useRoutes", 11, /§ .*useRoutes/, 12],
      ];
      for (const [rel, symbol, defLine, crumbs, at] of files) {
        await edit(s, rel);
        await outlinePicker(s, rel.split("/").at(-1)!);
        await s.see(new RegExp(`${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+${defLine}\\s*│`));
        await s.keys("escape");
        await line(s, at);
        await s.until(() => crumbs.test(crumb(s)), 5000, `${rel}'s breadcrumb at line ${at}: ${crumbs}`);
      }
    },
  },

  {
    area: "reading",
    name: "code: syntax errors in TypeScript and Go counted on the status line, no server",
    covers: { cases: ["code-ts", "code-go"], commands: ["note.open"] },
    options: { home: true, startAt: KESTREL },
    run: async (s) => {
      // A TypeScript file left by a bad rebase: its errors counted on the status line.
      await edit(s, "src/sync/stray-token.ts");
      await s.status(signed("{error} ?\\d"), 5000);
      // And a Go file's: another grammar's errors, the same way.
      await edit(s, "tools/uploader/broken.go");
      await s.status(signed("{error} ?\\d"), 5000);
    },
  },

  {
    area: "reading",
    name: "code: a 4,000-line TypeScript file — its outline found, G at its end, keys answered at once",
    covers: { cases: ["code-ts", "large"], commands: ["outline.pick"] },
    options: { home: true, startAt: KESTREL },
    run: async (s) => {
      await edit(s, "src/generated/routes-big.ts");
      // Its outline: a class near its end, found by the grammar on a file this size.
      await outlinePicker(s, "routes-big.ts");
      await s.type("RouteTable19");
      await s.see(/RouteTable19\s+4091\s*│/);
      // Picked: the cursor at its line.
      await moveTo(s, ["enter"], (l) => l === 4091, "enter on RouteTable19 to its line");
      await moveTo(s, ["G"], (l) => l >= 4300, "G to the end of 4,304 lines");
      // Keys answer at once there: each move lands within the usual wait, not after a re-parse.
      const end = pos(s).line;
      await moveTo(s, ["k", "k", "k"], (l) => l < end, "k three times");
      await moveTo(s, ["g", "g"], (l) => l === 1, "gg back to the top");
      // The code view reads no counts (normal mode's are source mode's and the lens's): :4000.
      await line(s, 4000);
      await s.until(() => /RouteTable18/.test(crumb(s)), 5000, "the breadcrumb in RouteTable18 at line 4000");
    },
  },

  {
    area: "reading",
    name: "code view: a comment's prose drawn as text, its path a link enter follows",
    covers: { cases: ["code-ts", "code-files"], commands: ["link.follow"] },
    options: { home: true, startAt: "home/work/kestrel/src/sync/queue.ts" },
    run: async (s) => {
      // The code view (READ, not SOURCE): the first comment is prose, its `../../docs/sync.md` a link enter follows.
      await s.status(/READ/);
      await opened(s, "src/sync/queue.ts");
      await followLink(s, "../../docs/sync.md");
      await opened(s, "docs/sync.md");
      await s.where(/^kestrel(?: │|$)/);
    },
  },

  {
    area: "reading",
    name: "code view: a syntax error slipbox finds itself, no server — counted, and on its cell's header alone",
    covers: { cases: ["code-ts", "unicode"] },
    options: { home: true, startAt: "home/work/kestrel/src/routes/name.ts" },
    run: async (s) => {
      await s.status(/READ/);
      await s.status(signed("{error} 1"), 8000);
      // Its sign among the cell header's buttons (a count beside it only from two); the other cell's header has none.
      await s.until(
        () => s.screen().some((r) => r.includes("function: badge") && signed("{error}").test(r)),
        5000,
        "the badge function's cell header with the error's sign",
      );
      const fine = s.screen().find((r) => r.includes("function: normalise")) ?? "";
      s.expect(
        !!fine && !signed("{error}|{warning}").test(fine),
        `the normalise cell's header with no problem's sign: ${fine}`,
      );
    },
  },
];
