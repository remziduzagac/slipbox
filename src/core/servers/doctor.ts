// `slipbox doctor` (plan 19.7): each language's servers, and for each where it is — found, and
// where; on npm, so installed when first needed; native and nowhere, and how to get it. For a file:
// its language, its project, and the servers that would serve it there.

import { type Choice, chooseServers, findServer, rootFor, type Where } from "./find.ts";
import { languageOf, projectAsks, type ServerDef, type ServerTable } from "./languages.ts";

export interface ServerReport {
  name: string;
  /** The main server (the first that applies is used), or an add-on, run where the project has its config. */
  role: "main" | "add-on";
  /** found; installable (npm, installed when first needed); missing (native, nowhere; or npm with installing off). */
  status: "found" | "installable" | "missing";
  where: Where | null;
  path: string | null;
  /** The npm package slipbox installs, pinned. */
  package: string | null;
  /** How to get a native one. */
  hint: string | null;
  /** An add-on's config files: where it runs. */
  requires: string[] | null;
}

export interface LanguageReport {
  /** Languages that share these servers. */
  languages: string[];
  servers: ServerReport[];
}

function report(def: ServerDef, root: string, autoInstall: boolean): ServerReport {
  const f = findServer(def, root);
  return {
    name: def.name,
    role: def.requires ? "add-on" : "main",
    status: f ? "found" : def.npm && autoInstall ? "installable" : "missing",
    where: f?.where ?? null,
    path: f?.path ?? null,
    package: def.npm ? `${def.npm.package}@${def.npm.version}` : null,
    hint: def.hint ?? null,
    requires: def.requires ?? null,
  };
}

/** Every language's servers, as found from `root` (a project's own programs count there). */
export function doctor(table: ServerTable, root: string, autoInstall: boolean): LanguageReport[] {
  const groups = new Map<string, LanguageReport>();
  for (const lang of table.languages) {
    const key = lang.servers.join(",");
    const g = groups.get(key);
    if (g) {
      g.languages.push(lang.name);
      continue;
    }
    const servers = lang.servers.map((n) => table.servers[n]).filter((d): d is ServerDef => !!d);
    groups.set(key, { languages: [lang.name], servers: servers.map((d) => report(d, root, autoInstall)) });
  }
  return [...groups.values()];
}

export interface FileReport {
  language: string;
  languageId: string;
  /** Its project's top folder. */
  root: string;
  /** The servers that would serve it there, the main one first; and those it would have had, missing. */
  run: ServerReport[];
  missing: ServerReport[];
}

/** One file: its language, its project, and its servers there; null when slipbox serves no language of it. */
export function doctorFile(table: ServerTable, path: string, autoInstall: boolean): FileReport | null {
  const lang = languageOf(table, path);
  if (!lang) return null;
  const root = rootFor(path, lang.roots);
  const choice: Choice = chooseServers(lang, table.servers, root, (r) => projectAsks(root, r));
  return {
    language: lang.name,
    languageId: lang.languageId,
    root,
    run: choice.run.map((r) => report(r.def, root, autoInstall)),
    missing: choice.missing.map((d) => report(d, root, autoInstall)),
  };
}
