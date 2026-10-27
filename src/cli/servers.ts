// The CLI's language servers (19.x): each language's servers and linters and where each is (`doctor`); a file's
// problems from every source — its servers', its linters', its syntax, a note's links and lint (`diagnostics`).

import { grammar, grammarFor, parseSyntax } from "../core/documents/syntax/syntax.ts";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { gitGuardsAttributes } from "../core/workspace/git/branches/gitops.ts";
import { loadConfig } from "../core/application/config/config.ts";
import { lintCommand, runLint } from "../core/documents/diagnostics/lint.ts";
import { classify, extensionOf } from "../core/documents/model/filetypes.ts";
import { climbsOut, readText } from "../core/foundation/platform/fsutil.ts";
import { doctor, doctorFile, type LinterReport, type ServerReport } from "../core/documents/servers/doctor.ts";
import { linterRoot, linterTable, runLinter } from "../core/documents/servers/linters.ts";
import { ServerManager } from "../core/documents/servers/manager.ts";
import {
  atLeast,
  lintProblems,
  noteProblems,
  type Problem,
  SEVERITIES,
  type Severity,
  syntaxProblems,
} from "../core/documents/diagnostics/diagnostics.ts";
import { languageOf, serverTable } from "../core/documents/servers/languages.ts";
import { rootFor } from "../core/documents/servers/find.ts";
import { isTrusted } from "../core/workspace/vaults/trust.ts";
import { flag, UsageError } from "./args.ts";
import { EXIT, CliError, type Handler, requireArg } from "./common.ts";

/** Language servers and linters (19.7, 19.19), and a file's problems (19.22). */
export const SERVER_COMMANDS: Record<string, Handler> = {
  // Language servers (19.7) and linters (19.19): each language's, and where each is; for a file, the
  // ones serving it.
  doctor(s, rest) {
    const table = serverTable(s.config["language-server"], s.config.language);
    const linters = linterTable(s.config.linter);
    const auto = s.config.lsp.auto_install;
    const home = homedir();
    const short = (p: string) => (p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p);
    const line = (r: ServerReport) => {
      const what =
        r.status === "found"
          ? `${r.where}  ${short(r.path!)}${r.behind !== undefined ? ` — not from the lockfile slipbox ships (${r.behind ?? "?"} installed, ${r.package} pinned): ${auto ? "installed again when it's next needed" : "installing is off ([lsp] auto_install)"}` : ""}`
          : r.status === "installable"
            ? `not found: slipbox installs ${r.package} when it's first needed`
            : r.package
              ? `not found, and installing is off ([lsp] auto_install): ${r.package}`
              : `not found: ${r.hint ?? "install it, or name it in [language-server]"}`;
      const role = r.role === "add-on" ? `  (where the project has ${r.requires!.slice(0, 2).join(" or ")}…)` : "";
      return `  ${r.name.padEnd(28)} ${what}${role}\n`;
    };
    const lintLine = (r: LinterReport) => {
      const what = r.path
        ? `${r.where}  ${short(r.path)}`
        : `not found: ${r.hint ?? `${r.program}, on your PATH or the project's`}`;
      const at =
        r.root === undefined
          ? r.required
            ? `  (where the project has ${r.markers.slice(0, 2).join(" or ")}…)`
            : ""
          : r.root === null
            ? "  (not run: the project has no config for it)"
            : `  (runs in ${short(r.root)})`;
      return `  ${`${r.name} (linter)`.padEnd(28)} ${what}${at}\n`;
    };
    // A root you don't trust (23.x): what runs there is yours, never the folder's; said, with what it limits.
    const untrusted = (root: string, limits: string[]) => {
      s.warnings.push(
        `${short(root)} isn't a vault you trust: nothing of its own runs — not its programs, its settings that name one, or the code its servers and git would run${limits.length ? ` (here: ${limits.join("; ")})` : ""}; slipbox asks whether you trust it when that matters (or :trust there), and [trust] roots in your config can list it`,
      );
      if (!gitGuardsAttributes())
        s.warnings.push(
          "git is older than 2.42: in a vault you don't trust, the filters its attributes name can still run — git 2.42 or later stops them",
        );
    };
    if (rest[0]) {
      const abs = isAbsolute(rest[0]) ? rest[0] : join(s.io.cwd, rest[0]);
      const f = doctorFile(table, linters, abs, auto);
      if (!f) throw new CliError(`${rest[0]}: slipbox serves no language of it`, EXIT.notFound);
      if (!f.trusted) untrusted(f.root, f.limits);
      const skipped = f.skipped.map((k) => `  ${k.name.padEnd(28)} not run here: ${k.why}\n`);
      const human = [
        `${rest[0]}: ${f.language}, its project ${short(f.root)}${f.trusted ? " (a vault you trust)" : ""}\n`,
        ...f.run.map(line),
        ...skipped,
        ...f.linters.map(lintLine),
        ...(f.missing.length ? ["missing:\n", ...f.missing.map(line)] : []),
      ].join("");
      return { data: f, human };
    }
    const groups = doctor(table, linters, s.io.cwd, auto);
    if (!isTrusted(s.io.cwd)) untrusted(s.io.cwd, []);
    if (!s.config.lsp.enabled) s.warnings.push("language servers are off: [lsp] enabled = false");
    return {
      data: groups,
      human: groups
        .map((g) => `${g.languages.join(", ")}\n${g.servers.map(line).join("")}${g.linters.map(lintLine).join("")}`)
        .join(""),
    };
  },

  // A file's problems from every source (19.22), for agents and scripts: its language servers' — started,
  // told the file, waited for until each has spoken and gone quiet — its linters' (19.19), its syntax
  // errors when no server answered, and a vault note's own and the lint surface's. Exit 1 on an error.
  async diagnostics(s, rest) {
    const arg = requireArg(rest, "file");
    // From here, else from --root (`noteArgPath`).
    const root = flag(s.args, "root");
    const abs = [resolve(s.io.cwd, arg), root ? resolve(s.io.cwd, root, arg) : null].find((p) => p && existsSync(p));
    if (!abs) throw new CliError(`${arg}: no such file`, EXIT.notFound);
    const min = (flag(s.args, "severity") ?? s.config.diagnostics.severity) as Severity;
    if (!SEVERITIES.includes(min)) throw new UsageError(`--severity takes ${SEVERITIES.join(", ")}`);
    const seconds = Number(flag(s.args, "timeout") ?? 60);
    if (!(seconds > 0)) throw new UsageError("--timeout takes seconds, more than 0");
    const text = readText(abs).text;
    const table = serverTable(s.config["language-server"], s.config.language);
    const lang = languageOf(table, abs);
    const problems: Problem[] = [];
    const sources: { name: string; kind: "server" | "linter" | "syntax" | "slipbox" | "lint"; status: string }[] = [];
    // Its servers: each heard once, then quiet for a while — a server says what it finds in stages.
    let answered = 0;
    if (lang && s.config.lsp.enabled) {
      const heard = new Map<string, Problem[]>();
      let news = Date.now();
      // Yours alone, for a root you don't trust (23.3): no folder's settings reach its servers.
      const yours = loadConfig({ configFile: flag(s.args, "config") }).config;
      const m = new ServerManager({
        table: () => table,
        userTable: () => serverTable(yours["language-server"], yours.language),
        autoInstall: () => s.config.lsp.auto_install,
        problems: (path, server, _v, list) => {
          if (path !== abs) return;
          heard.set(server, list);
          news = Date.now();
        },
        message: (_level, text) => s.io.err(`${text}\n`),
        // Each request waits as long as the whole command does: a server still at its first analysis is waited for.
        requestTimeoutMs: seconds * 1000,
      });
      const deadline = Date.now() + seconds * 1000;
      m.open(abs, 1, text);
      const running = await within(m.started(abs, "diagnostics"), seconds * 1000, [] as string[]);
      // A server still at some work it said it began (rust-analyzer loading its workspace: its first word is
      // empty) is news too: its quiet counts from when the work ends, and what it says after.
      while (Date.now() < deadline && !(running.every((n) => heard.has(n)) && Date.now() - news >= 750)) {
        if (m.busy(abs)) news = Date.now();
        await Bun.sleep(50);
      }
      for (const name of running)
        sources.push({ name, kind: "server", status: heard.has(name) ? "answered" : "silent" });
      for (const list of heard.values()) problems.push(...list), answered++;
      await within(m.stopAll(), 3000, undefined);
      m.killAll();
    }
    // Its linters without a server, where its project asks for them.
    const linters = linterTable(s.config.linter);
    for (const def of (lang?.linters ?? []).map((n) => linters[n]).filter((d) => !!d?.command)) {
      const root = linterRoot(def!, abs, rootFor(abs, lang!.roots));
      if (!root) {
        sources.push({ name: def!.name, kind: "linter", status: "not asked" });
        continue;
      }
      const r = s.config.lint.enabled === "off" ? null : await runLinter(def!, abs, text, root);
      if (r && "problems" in r) problems.push(...r.problems);
      if (r && "skipped" in r) s.warnings.push(`${r.skipped} — its findings aren't shown`);
      sources.push({
        name: def!.name,
        kind: "linter",
        status: r === null ? "off" : "problems" in r ? "ran" : "skipped" in r ? "skipped" : r.failed,
      });
    }
    // Its syntax errors, when no server has spoken for the text (a server has them then).
    const kind = classify(abs, s.config.walk.extensions);
    const g = kind.group === "text" ? grammarFor(kind.format, extensionOf(abs)) : null;
    if (g && !answered) {
      const loaded = await grammar(g);
      const tree = loaded ? parseSyntax(loaded, text) : null;
      if (tree) {
        problems.push(...syntaxProblems(tree.errors()));
        tree.delete();
        sources.push({ name: "tree-sitter", kind: "syntax", status: "ran" });
      }
    }
    // A vault note: its links and conflicts, and the lint surface's findings. One the walk leaves out
    // (git-ignored, under a hidden folder) is reached, named, as findNoteArg reaches it (20.8).
    const rel = relative(s.loc.root, abs).split(sep).join("/");
    if (
      kind.group === "note" &&
      !climbsOut(rel) &&
      (s.graph.notes.has(rel) || s.graph.reachFile(rel, { keep: true })) &&
      s.graph.notes.has(rel)
    ) {
      problems.push(...noteProblems(s.graph, rel));
      sources.push({ name: "slipbox", kind: "slipbox", status: "ran" });
      const cmd = lintCommand(s.config.lint, s.loc.root, undefined, s.config.lsp.auto_install);
      if (cmd) {
        const issues = await runLint(cmd, [abs], s.loc.root, undefined, (t) => s.io.err(`${t}\n`));
        if (Array.isArray(issues)) problems.push(...lintProblems(issues.filter((i) => i.file === abs)));
        else if (issues) s.warnings.push(`markdownlint: ${issues.skipped} — its findings aren't shown`);
        const status = Array.isArray(issues) ? "ran" : issues ? "skipped" : "failed";
        sources.push({ name: "markdownlint", kind: "lint", status });
      }
    }
    for (const src of sources)
      if (["silent", "missing", "timeout", "error", "failed"].includes(src.status))
        s.warnings.push(
          `${src.name}: ${src.status === "silent" ? `said nothing in ${seconds} s` : src.status === "missing" ? "not installed" : `couldn't run (${src.status})`}`,
        );
    if (!lang && kind.group !== "note") s.warnings.push(`${arg}: slipbox knows no language of it — slipbox doctor`);
    const shown = problems
      .filter((p) => atLeast(p.severity, min))
      .sort(
        (a, b) =>
          a.start.line - b.start.line ||
          a.start.column - b.start.column ||
          SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity),
      );
    const human = shown
      .map(
        (p) =>
          `${arg}:${p.start.line}:${p.start.column}: ${p.severity} ${p.source}${p.code ? ` ${p.code}` : ""}: ${p.message.replace(/\s*\n\s*/g, " ")}\n`,
      )
      .join("");
    return {
      data: {
        path: abs,
        language: lang?.name ?? null,
        problems: shown.map((p) => ({
          line: p.start.line,
          column: p.start.column,
          endLine: p.end.line,
          endColumn: p.end.column,
          severity: p.severity,
          source: p.source,
          code: p.code,
          message: p.message,
        })),
        sources,
      },
      human,
      code: shown.some((p) => p.severity === "error") ? EXIT.error : EXIT.ok,
    };
  },
};

/** A promise's value, or `fallback` after `ms` — the timer cleared either way, so nothing waits on it after. */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((done) => (timer = setTimeout(() => done(fallback), ms)));
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
