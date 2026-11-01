import { spawnSync } from "node:child_process";
import { type Check, leader, opened, problemListed, signed, TSC } from "../check.ts";
import { numberStyle } from "../support/diagnostics.ts";
import { onto } from "../support/outside-and-code.ts";

/** The reference set's share links (kestrel's web app): a type error on purpose, a function used from another file. */
const SHARE = "home/work/kestrel/src/routes/share.ts";

/**
 * TypeScript's own server, the repository's (19.x): nothing installed or fetched, the only server of its files. Code
 * in source mode, a line to a row, each numbered; kestrel trusted, so nothing asks first (23.x).
 */
const TS_CONFIG = `[render]
code = "source"

[lsp]
enabled = true
auto_install = false

[trust]
roots = ["{home}/work/kestrel"]

[language-server.typescript]
command = ${JSON.stringify(TSC)}

[[language]]
name = "typescript"
language-servers = ["typescript"]
`;

/** A child of `pid` whose command line matches: a server slipbox started (ps's columns as Linux and macOS have them). */
function childOf(pid: number, match: RegExp): number | null {
  const out = spawnSync("ps", ["-A", "-o", "pid=,ppid=,args="], { encoding: "utf8" }).stdout;
  for (const line of out.split("\n")) {
    const [child, parent, ...args] = line.trim().split(/\s+/);
    if (Number(parent) === pid && match.test(args.join(" "))) return Number(child);
  }
  return null;
}

export const LANGUAGE_SERVERS: Check[] = [
  // --- language servers ---------------------------------------------------------------------------
  {
    area: "outside-and-code",
    name: "language servers: a TypeScript file's error from TypeScript's own server — counted, listed, its line's number in the error's colour; fixed, gone",
    covers: { cases: ["lsp", "problems"], commands: ["problems.file"] },
    options: { home: true, startAt: SHARE, config: TS_CONFIG },
    run: async (s) => {
      // `ttlSeconds: "3600"`, line 35: counted on the status line, said in the Problems panel.
      await s.status(signed("{error} 1"), 15000);
      await problemListed(s, signed("{error} 35:\\d+ +Type 'string' is not assignable to type 'number'"));
      // The gutter: the error's line number in the error's colour, its neighbour's not.
      await s.until(
        () => {
          const [bad, good] = [numberStyle(s, 35, "return links.create"), numberStyle(s, 34, "const links = new")];
          return !!bad && !!good && bad.fg !== good.fg && bad.bold;
        },
        5000,
        "line 35's number in the error's colour",
      );
      // Fixed and typed in: gone once the server says so again.
      await s.ex("35");
      await s.keys("f", '"', "d", "a", '"', "i");
      await s.type("3600 ");
      await s.keys("escape");
      await s.see("ttlSeconds: 3600 }");
      await s.until(() => !signed("{error}").test(s.statusLine()), 10000, "the error gone with the fix");
    },
  },
  {
    area: "outside-and-code",
    name: "language servers: what's under the cursor — shift+k its type, g d its definition in another file, g r its uses (19.12, 19.13)",
    covers: { cases: ["lsp"], commands: ["lsp.hover", "lsp.definition", "lsp.references", "history.back"] },
    options: { home: true, startAt: SHARE, config: TS_CONFIG },
    run: async (s) => {
      await s.status(signed("{error} 1"), 15000); // the server has read the file
      // On sign, as share.ts calls it: its type, floating; its definition, in sign.ts.
      await onto(s, "sign(opts");
      await s.status(/L16:/);
      await s.keys("shift+k");
      await s.see("function sign(token: string, expires: number): string", 10000);
      await s.keys("escape");
      await s.keys("g", "d");
      await opened(s, "src/routes/sign.ts");
      await s.status(/L6:17\b/, 10000);
      await s.keys("ctrl+o");
      await opened(s, "src/routes/share.ts");
      // formatKm's uses, to pick from: here, and in format.mts beside its definition.
      await onto(s, "formatKm(km");
      await s.keys("g", "r");
      await s.see(/2 references/, 10000);
      await s.see(/share\.ts:23 +return `Route/);
      await s.see(/format\.mts:14 +return r\?\.km !== undefined \? formatKm/);
      await s.keys("down", "enter");
      await opened(s, "src/util/format.mts");
      await s.status(/L14:/);
    },
  },
  {
    area: "outside-and-code",
    name: "language servers: g y goes to the type's definition, g shift+i lists the implementations to pick from (19.13)",
    covers: { cases: ["lsp"], commands: ["lsp.type_definition", "lsp.implementation"] },
    // A share link's lifetime: an interface two classes implement, a default of its type.
    options: { home: true, startAt: "home/work/kestrel/src/routes/expiry.ts", config: TS_CONFIG },
    run: async (s) => {
      // On e of `e.seconds(now)`: its type is Expiry, line 3 — where g d would go is its parameter, line 27.
      await onto(s, "e.seconds(now)");
      await s.status(/L27:/);
      await s.keys("g", "y");
      await s.status(/L3:18\b/, 15000);
      // On Expiry: the two classes that implement it, a list; the second picked.
      await s.keys("g", "shift+i");
      await s.see("2 implementations", 10000);
      await s.see(/expiry\.ts:8 +export class FixedExpiry implements Expiry/);
      await s.see(/expiry\.ts:17 +export class RideExpiry implements Expiry/);
      await s.keys("down", "enter");
      await s.status(/L17:14\b/);
      await s.notSee("2 implementations");
    },
  },
  {
    area: "outside-and-code",
    name: "language servers: the server's changes — a rename after a preview, code actions, formatting; each said (19.15)",
    covers: { cases: ["lsp"], commands: ["lsp.rename", "lsp.code_action", "lsp.format"] },
    options: { home: true, startAt: SHARE, config: TS_CONFIG },
    run: async (s) => {
      await s.status(signed("{error} 1"), 15000);
      // expires, the local of create(): renamed by the server, its three uses, after a preview.
      await onto(s, "expires = Math");
      await leader(s, "c", "r");
      await s.see("rename expires to:", 10000);
      await s.keys("ctrl+u");
      await s.type("expiry");
      await s.keys("enter");
      await s.see("rename expires → expiry: 3 changes in 1 file", 10000);
      await s.keys("enter");
      await s.see("const expiry = Math.floor");
      await s.see("const sig = sign(opts.routeId, expiry);");
      // Its code actions for the line, and its formatting: each says what it did.
      await leader(s, "c", "a");
      await s.until(() => /Code actions|no code actions here/.test(s.text()), 10000, "the code actions, or none");
      await s.keys("escape");
      await leader(s, "c", "f");
      await s.until(() => /formatted|doesn't format/.test(s.text()), 10000, "formatted, or said it can't");
    },
  },
  {
    area: "outside-and-code",
    name: "language servers: completion as it's typed, then the signature being typed (19.16)",
    covers: { cases: ["lsp"] },
    options: { home: true, startAt: SHARE, config: TS_CONFIG },
    run: async (s) => {
      await s.status(signed("{error} 1"), 15000);
      // Math's members after `.`, narrowed by what follows, one put in; then the signature, after `(`.
      await s.keys("shift+g", "o");
      await s.type("Math.rou");
      await s.see("round", 10000);
      await s.keys("enter");
      await s.see("Math.round");
      await s.type("(");
      await s.see(/round\(x: number\): number/, 10000);
      await s.keys("escape");
      await s.see("Math.round(");
    },
  },
  {
    area: "outside-and-code",
    name: "language servers: TypeScript's server killed — said, started again, a new problem found by it",
    covers: { cases: ["lsp"] },
    options: { home: true, startAt: SHARE, config: TS_CONFIG },
    run: async (s) => {
      await s.status(signed("{error} 1"), 15000);
      const server = childOf(s.pid()!, /tsc|typescript/);
      s.expect(server !== null, "TypeScript's server among slipbox's children");
      process.kill(server!, "SIGKILL");
      await s.message("crashed", 5000);
      // Only a server running again finds this one.
      await s.keys("shift+g", "o");
      await s.type("const t: string = 1;");
      await s.keys("escape");
      await problemListed(s, "Type 'number' is not assignable to type 'string'", 15000);
    },
  },
];
