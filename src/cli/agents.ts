// The CLI's commands for an agent at work: the context bundle (9.7), a capture to the scratch and the scratch
// itself (8.2–8.4), and a note sent to a running editor (4.12).

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  appendScratch,
  CaptureError,
  clearScratch,
  formatEntry,
  parseRef,
  readScratch,
  scratchLocation,
} from "../core/capture.ts";
import { copyTextAsync } from "../core/foundation/platform/clipboard.ts";
import { buildContext } from "../core/documents/model/context.ts";
import { stateDir } from "../core/foundation/platform/paths.ts";
import { readRegular } from "../core/foundation/platform/fsutil.ts";
import { editorArgv } from "../core/editor.ts";
import { discoverNvims, NVIM_REMOTE, probeNvim } from "../core/nvim.ts";
import { loadSession } from "../core/workspace/session/position.ts";
import { flag, has, UsageError } from "./args.ts";
import {
  EXIT,
  CliError,
  type Session,
  type Handler,
  refuseUnfollowed,
  requireArg,
  resolveNote,
  wholeFlag,
  notIndexed,
} from "./common.ts";

/** For an agent at work: a context bundle, the scratch, a note sent to a running editor. */
export const AGENT_COMMANDS: Record<string, Handler> = {
  // The context bundle (9.7): the notes, what they link to and what links to them, as one document.
  async context(s, rest) {
    if (!rest.length) throw new UsageError("missing a note (context <note>…)");
    const start = [...new Set(rest.map((r) => resolveNote(s, r)))];
    const num = (name: string, fallback: number, lo: number, hi: number) => wholeFlag(s, name, fallback, lo, hi);
    const opts = {
      depth: num("depth", s.config.context.depth, 0, 5),
      // Elsewhere has none to add (VV-D3): said, below.
      backlinks: s.config.context.backlinks && !has(s.args, "no-backlinks") && s.loc.mode !== "folder",
      limit: num("limit", s.config.context.limit, 1, 500),
    };
    await s.graph.loadGrammars(); // code files link from their comments (16.10): backlinks too
    if (s.loc.mode === "folder" && s.config.context.backlinks && !has(s.args, "no-backlinks"))
      s.warnings.push("no backlinks: Elsewhere has no index — the notes' own links only");
    const b = buildContext(s.graph, start, opts);
    const files = b.items.map(({ text: _, ...i }) => i);
    const data = { start, ...opts, files, left: b.left, chars: b.text.length, text: b.text };
    if (!has(s.args, "copy")) return { data, human: b.text };
    const r = await copyTextAsync(b.text, { fallbackDir: stateDir(s.loc) });
    const how = r.file
      ? `wrote ${r.file}`
      : `copied via ${r.methods.join(" + ")}${r.confirmed ? "" : " (OSC 52 is unconfirmed)"}`;
    return {
      data: { ...data, copied: r },
      human: `${how}: ${b.items.length} file${b.items.length === 1 ? "" : "s"}, ${b.text.length} chars\n`,
    };
  },

  async capture(s, rest) {
    const project = s.loc.root;
    const loc = scratchLocation(s.loc, s.config);
    const refArg = flag(s.args, "ref");
    const ref = refArg ? parseRef(refArg) : undefined;
    if (refArg && !ref)
      throw new UsageError(
        `--ref must look like path:42, path:42-50, path:42:10-30 or path:42:10-50:30, with lines from 1 and ranges in order`,
      );
    let text = rest.join(" ");
    let snippetText: string | undefined;
    if (has(s.args, "stdin")) {
      const input = await s.io.stdin();
      // --stdin with nothing on it is a producer that failed, as for write: not an empty fence.
      if (!input.trim()) throw new UsageError("nothing on stdin to capture");
      // With a ref, stdin is the snippet (a visual selection from nvim); without, it is the text.
      // With --lang, stdin is code to fence even without a reference.
      if (ref || flag(s.args, "lang")) snippetText = input;
      else text = text ? `${text}\n\n${input}` : input;
    }
    if (!text.trim() && !ref && snippetText === undefined)
      throw new UsageError("nothing to capture: give text, --ref, or --stdin");
    // A snippet read from the file follows the place's rule, as `read` does (VV-D6): not through a link not followed.
    if (ref && snippetText === undefined && has(s.args, "snippet"))
      refuseUnfollowed(s, resolve(s.io.cwd, ref.path), ref.path);
    let entry: string;
    try {
      entry = formatEntry(
        {
          text,
          ref: ref ?? undefined,
          snippet: has(s.args, "snippet"),
          snippetText,
          lang: flag(s.args, "lang"),
          cwd: s.io.cwd,
        },
        project,
      );
    } catch (err) {
      if (err instanceof CaptureError) throw new CliError(err.message, EXIT.notFound);
      throw err;
    }
    // A reference to a file that isn't there, or past its end, is kept (the file may come later)
    // but said: it is usually a typo.
    if (ref && snippetText === undefined && !has(s.args, "snippet")) {
      const abs = isAbsolute(ref.path) ? ref.path : join(s.io.cwd, ref.path);
      let lines: number | null = null;
      try {
        const t = readRegular(abs, 64 << 20).toString("utf8");
        lines = t.split("\n").length - (t.endsWith("\n") ? 1 : 0);
      } catch {
        s.warnings.push(`--ref ${ref.path}: no such file`);
      }
      const last = ref.endLine ?? ref.startLine;
      if (lines !== null && last > lines)
        s.warnings.push(`--ref ${ref.path}: line ${last} is past the end (${lines} lines)`);
    }
    appendScratch(loc, entry);
    // In the vault (`capture.location = "root"`) where `walk.exclude` leaves it out (D246): its human output is the
    // scratch's path alone, for scripts, so a warning says it.
    const left = notIndexed(s, loc.path);
    if (left && !has(s.args, "json"))
      s.warnings.push(`the scratch, ${relative(project, loc.path)}, is not indexed: ${left} leaves it out`);
    return {
      data: { scratch: loc.path, project, entry, ...(left ? { notIndexed: left } : {}) },
      human: `${loc.path}\n`,
    };
  },

  async scratch(s, rest) {
    const sub = rest[0] ?? "show";
    const loc = scratchLocation(s.loc, s.config);
    const content = readScratch(loc);
    const sha = createHash("sha256").update(content).digest("hex").slice(0, 16);
    switch (sub) {
      case "path":
        return { data: { path: loc.path, exists: existsSync(loc.path) }, human: `${loc.path}\n` };
      case "show":
        return { data: { path: loc.path, content, sha }, human: content };
      case "clear": {
        const expect = flag(s.args, "if-unchanged");
        if (expect === "") throw new UsageError("--if-unchanged needs a sha (an empty one would check nothing)");
        if (expect && expect !== sha)
          throw new CliError(`scratch changed since ${expect} (now ${sha}); not cleared`, EXIT.refused, { sha });
        clearScratch(loc);
        return { data: { path: loc.path, cleared: true, previousSha: sha }, human: "" };
      }
      case "copy": {
        if (!content.trim()) throw new CliError("scratch is empty", EXIT.notFound);
        const r = await copyTextAsync(content, { fallbackDir: stateDir(s.loc) });
        const how = r.file
          ? `wrote ${r.file}`
          : `copied via ${r.methods.join(" + ")}${r.confirmed ? "" : " (OSC 52 is unconfirmed)"}`;
        return { data: { path: loc.path, chars: content.length, ...r }, human: `${how} (${content.length} chars)\n` };
      }
      default:
        throw new UsageError(`scratch: unknown subcommand ${sub} (show, path, clear, copy)`);
    }
  },

  send(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"), false);
    const abs = s.graph.abs(rel);
    const lineArg = flag(s.args, "line") ?? "1";
    if (!/^\d+$/.test(lineArg) || Number(lineArg) < 1) throw new UsageError("--line must be a whole number from 1");
    const line = Number(lineArg);
    const raw = s.config.editor.remote.filter((t) => t.trim());
    if (!raw.length)
      throw new CliError("set [editor] remote in the config to send notes to a running editor", EXIT.error);
    const templates = raw.length === 1 && raw[0]!.trim() === "nvim" ? NVIM_REMOTE : raw;
    let server = "";
    if (templates.some((t) => t.includes("{server}"))) server = pickNvim(s, abs);
    else if (flag(s.args, "server")) s.warnings.push("--server has no effect: [editor] remote names no {server}");
    const commands = templates.map((t) => editorArgv(t, abs, line, s.io.env, false, server));
    for (const argv of commands) {
      const r = spawnSync(argv[0]!, argv.slice(1), { stdio: "ignore", timeout: 10000 });
      if (r.error) throw new CliError(`couldn't start ${argv[0]}: ${r.error.message}`);
      if (r.status !== 0) throw new CliError(`${argv.slice(0, 2).join(" ")} exited with ${r.status}`);
    }
    return {
      data: { path: rel, line, server: server || null, commands },
      human: `sent ${rel}:${line}${server ? ` to ${server}` : ""}\n`,
    };
  },
};

/**
 * The nvim to send to: --server, else the one picked last in the TUI while it answers, else the
 * only one running, else the one working where the note lives (the closest folder).
 */
function pickNvim(s: Session, abs: string): string {
  const given = flag(s.args, "server");
  if (given) {
    if (!probeNvim(given)) throw new CliError(`no nvim answers at ${given}`, EXIT.notFound);
    return given;
  }
  const last = loadSession(s.loc)?.remote_server;
  if (last && probeNvim(last)) return last;
  const found = discoverNvims();
  if (!found.length)
    throw new CliError("no nvim is running with a server — start nvim (0.9 or later) and try again", EXIT.notFound);
  if (found.length === 1) return found[0]!.socket;
  const holding = found
    .filter((n) => n.cwd && (abs === n.cwd || abs.startsWith(`${n.cwd}/`)))
    .sort((a, b) => b.cwd.length - a.cwd.length);
  if (holding.length && (holding.length === 1 || holding[0]!.cwd.length > holding[1]!.cwd.length))
    return holding[0]!.socket;
  const candidates = found.map((n) => ({ socket: n.socket, cwd: n.cwd, file: n.file }));
  throw new CliError(
    `${found.length} nvims are running; pick one with --server (${found.map((n) => n.socket).join(", ")})`,
    EXIT.ambiguous,
    { candidates },
  );
}
