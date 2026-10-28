// Vault configuration capabilities: user-only settings and executable-command refusals.

import { SERVERS } from "../../documents/servers/languages.ts";
import { LINTERS } from "../../documents/servers/linters.ts";
import { isPlainObject } from "./validation/predicates.ts";

/**
 * Settings only your own config may set, each with why. A folder's committed config comes with whatever you clone,
 * so it never sets slipbox's own commands (a known server's `config` still reaches the server, trusted as everything
 * is: 19.6, configuration.md), nor what reaches the network: fetching a note's web pictures tells their sites who read
 * what, installing fetches from npm (DF-D1), and the update check asks slipbox's releases (DF-D23).
 */
export const USER_ONLY: Record<string, string> = {
  "editor.command": "it runs a program",
  "editor.remote": "it runs a program",
  "lint.command": "it runs a program",
  "render.images_remote": "what reaches the network is yours to allow",
  "lsp.auto_install": "what reaches the network is yours to allow",
  "update.check": "what reaches the network is yours to allow",
  "git.worktrees": "it says where slipbox makes folders, outside the vault",
};

/**
 * Commands a vault's keys and aliases may not name: each throws work away (quit without saving,
 * revert, overwrite, clear), and a cloned vault could otherwise put one on ctrl+s or :wq.
 */
export const VAULT_FORBIDDEN_COMMANDS = [
  "app.quit_force",
  "note.revert",
  "note.save_force",
  "scratch.clear",
  "shell.run",
  "shell.filter",
  "help.report_send",
];

/** Of those, the ones that run a program (25.7, RPT-D6): a folder's key would run what the folder chose. */
export const RUNS_A_PROGRAM = new Set(["shell.run", "shell.filter", "help.report_send"]);

export function dropUserOnly(data: Record<string, unknown>, file: string, warnings: string[]): void {
  // Keys and aliases (every mode's table) that name a command throwing work away.
  const strip = (table: unknown, where: string) => {
    if (!isPlainObject(table)) return;
    for (const [k, v] of Object.entries(table)) {
      if (isPlainObject(v)) strip(v, `${where}.${k}`);
      else if (typeof v === "string" && VAULT_FORBIDDEN_COMMANDS.includes(v.split(" ")[0]!)) {
        delete table[k];
        warnings.push(
          `config: ${file} binds ${where}.${k} to ${v}, which only your own config may (${RUNS_A_PROGRAM.has(v.split(" ")[0]!) ? "it runs a program" : "it throws work away"}); ignored`,
        );
      }
    }
  };
  strip(data.keys, "keys");
  strip(data.aliases, "aliases");
  // A server's program is the user's choice (19.2): a vault may tune a known server's settings, never
  // name what runs — its command, arguments, environment, or a server slipbox doesn't know (its name
  // would be the program run).
  const servers = data["language-server"];
  if (isPlainObject(servers)) {
    for (const [name, s] of Object.entries(servers)) {
      if (!Object.hasOwn(SERVERS, name)) {
        delete servers[name];
        warnings.push(
          `config: ${file} adds the language server ${name}, which only your own config may (it runs a program); ignored`,
        );
        continue;
      }
      for (const k of ["command", "args", "environment"]) {
        if (!isPlainObject(s) || !(k in s)) continue;
        delete s[k];
        warnings.push(
          `config: ${file} sets language-server.${name}.${k}, which only your own config may set (it runs a program); ignored`,
        );
      }
    }
  }
  // A linter's likewise (19.19): its command, or a linter slipbox doesn't know.
  const linters = data.linter;
  if (isPlainObject(linters)) {
    for (const [name, l] of Object.entries(linters)) {
      if (!Object.hasOwn(LINTERS, name)) {
        delete linters[name];
        warnings.push(
          `config: ${file} adds the linter ${name}, which only your own config may (it runs a program); ignored`,
        );
        continue;
      }
      if (isPlainObject(l) && "lint-command" in l) {
        delete l["lint-command"];
        warnings.push(
          `config: ${file} sets linter.${name}.lint-command, which only your own config may set (it runs a program); ignored`,
        );
      }
    }
  }
  // Which roots may run their own code (23.x): a folder can't vouch for itself.
  if ("trust" in data) {
    delete data.trust;
    warnings.push(
      `config: ${file} sets [trust], which only your own config may set (a folder can't trust itself); ignored`,
    );
  }
  // Where roots are (21.1) is found before any folder's config is: only yours can say.
  const walk = data.walk;
  if (isPlainObject(walk) && "root_markers" in walk) {
    delete walk.root_markers;
    warnings.push(
      `config: ${file} sets walk.root_markers, which only your own config may set (it decides where vaults are); ignored`,
    );
  }
  for (const [key, why] of Object.entries(USER_ONLY)) {
    const [table, name] = key.split(".") as [string, string];
    const t = data[table];
    if (!isPlainObject(t) || !(name in t)) continue;
    delete (t as Record<string, unknown>)[name];
    warnings.push(`config: ${file} sets ${key}, which only your own config may set (${why}); ignored`);
  }
}
