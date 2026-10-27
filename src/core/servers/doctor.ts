// `slipbox doctor` (plan 19.7): each language's servers, and for each where it is — found, and
// where; on npm, so installed when first needed; native and nowhere, and how to get it. Its linters
// without a server too (19.19). For a file: its language, its project, and what would serve it there.

import { type Choice, chooseServers, findServer, rootFor, type Where } from "./find.ts";
import { type LanguageDef, languageOf, projectAsks, type ServerDef, type ServerTable } from "./languages.ts";
import { type LinterDef, linterRoot, projectPath } from "./linters.ts";
import { limitsOf } from "./manager.ts";
import { isTrusted } from "../workspace/vaults/trust.ts";

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
  /** slipbox's own install, behind the lock it ships (14.11): the version it has (null: unread); installed again
   *  when it's next needed, if installing is on. Undefined: not behind. */
  behind?: string | null;
  /** How to get a native one. */
  hint: string | null;
  /** An add-on's config files: where it runs. */
  requires: string[] | null;
}

export interface LinterReport {
  name: string;
  /** Its program, as its command names it, and where it was found: the project's own, or on `PATH`. */
  program: string;
  where: "project" | "path" | null;
  path: string | null;
  hint: string | null;
  /** The config files it runs beside; `required`: only where one of them is. */
  markers: string[];
  required: boolean;
  /** For a file: where it would run, or null when its project doesn't ask for it. */
  root?: string | null;
}

export interface LanguageReport {
  /** Languages that share these servers and linters. */
  languages: string[];
  servers: ServerReport[];
  linters: LinterReport[];
}

function linterReport(def: LinterDef, root: string): LinterReport {
  const program = def.command.trim().split(/\s+/)[0] ?? "";
  const path = program ? Bun.which(program, { PATH: projectPath(root) }) : null;
  return {
    name: def.name,
    program,
    where: path ? (path.startsWith(`${root}/`) ? "project" : "path") : null,
    path,
    hint: def.hint ?? null,
    markers: def.rootMarkers,
    required: def.requireMarker,
  };
}

const lintersOf = (lang: LanguageDef, linters: Record<string, LinterDef>) =>
  (lang.linters ?? [])
    .map((n) => (Object.hasOwn(linters, n) ? linters[n] : undefined))
    .filter((d): d is LinterDef => !!d?.command);

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
    ...(f?.behind ? { behind: f.behind.installed } : {}),
  };
}

/** Every language's servers and linters, as found from `root` (a project's own programs count there). */
export function doctor(
  table: ServerTable,
  linters: Record<string, LinterDef>,
  root: string,
  autoInstall: boolean,
): LanguageReport[] {
  const groups = new Map<string, LanguageReport>();
  for (const lang of table.languages) {
    const key = `${lang.servers.join(",")};${(lang.linters ?? []).join(",")}`;
    const g = groups.get(key);
    if (g) {
      g.languages.push(lang.name);
      continue;
    }
    const servers = lang.servers
      .map((n) => (Object.hasOwn(table.servers, n) ? table.servers[n] : undefined))
      .filter((d): d is ServerDef => !!d);
    groups.set(key, {
      languages: [lang.name],
      servers: servers.map((d) => report(d, root, autoInstall)),
      linters: lintersOf(lang, linters).map((d) => linterReport(d, root)),
    });
  }
  return [...groups.values()];
}

export interface FileReport {
  language: string;
  languageId: string;
  /** Its project's top folder. */
  root: string;
  /** Whether that's a root you trust (23.x); when not, what that leaves out — empty when nothing. */
  trusted: boolean;
  limits: string[];
  /** Servers that would run the project's code, not run there, and why. */
  skipped: { name: string; why: string }[];
  /** The servers that would serve it there, the main one first; and those it would have had, missing. */
  run: ServerReport[];
  missing: ServerReport[];
  /** Its linters without a server, each with where it would run (null: the project doesn't ask for it). */
  linters: LinterReport[];
}

/** One file: its language, its project, and its servers there; null when slipbox serves no language of it. */
export function doctorFile(
  table: ServerTable,
  linters: Record<string, LinterDef>,
  path: string,
  autoInstall: boolean,
): FileReport | null {
  const lang = languageOf(table, path);
  if (!lang) return null;
  const root = rootFor(path, lang.roots);
  const choice: Choice = chooseServers(lang, table.servers, root, (r) => projectAsks(root, r));
  return {
    language: lang.name,
    languageId: lang.languageId,
    root,
    trusted: isTrusted(root),
    limits: limitsOf(choice, root),
    skipped: choice.skipped.map((s) => ({ name: s.def.name, why: s.why })),
    run: choice.run.map((r) => report(r.def, root, autoInstall)),
    missing: choice.missing.map((d) => report(d, root, autoInstall)),
    linters: lintersOf(lang, linters).map((d) => {
      const at = linterRoot(d, path, root);
      return { ...linterReport(d, at ?? root), root: at };
    }),
  };
}
