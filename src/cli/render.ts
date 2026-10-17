// The CLI's render and export: a note drawn as the TUI draws it, for a width, in colour or plain (2.x); notes made
// one document — Word, PDF, HTML, EPUB or Markdown — beside the first, or where `--out` says (10.x).

import { loadMermaid } from "../core/diagrams.ts";
import { statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type { Config } from "../core/config.ts";
import { glyphsFor, isGlyphMode } from "../core/glyphs.ts";
import { detectColorDepth, layoutToAnsi, type ColorDepth } from "../core/layout/ansi.ts";
import { layoutNote, layoutWidth } from "../core/note.ts";
import { applyColorOverrides, loadTheme } from "../core/theme/index.ts";
import { readText } from "../core/fsutil.ts";
import { exportNotes, exportTarget, FORMATS, formatFor, namesFolder, writeExport } from "../core/export/index.ts";
import { flag, has, UsageError } from "./args.ts";
import {
  EXIT,
  CliError,
  type Session,
  parseFile,
  type Handler,
  requireArg,
  resolveNote,
  notIndexed,
} from "./common.ts";

/** A note drawn for the terminal, and notes made one document. */
export const RENDER_COMMANDS: Record<string, Handler> = {
  async render(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    const abs = s.graph.abs(rel);
    const decoded = readText(abs);
    // A Mermaid diagram is drawn (12.10): its library loaded first, as the TUI's arrives on its own.
    if (/^ {0,3}(`{3,}|~{3,})\s*mermaid\s*$/im.test(decoded.text)) await loadMermaid();
    const depth = colorDepth(s);
    const widthArg = flag(s.args, "width");
    if (widthArg !== undefined && !/^\d+$/.test(widthArg))
      throw new UsageError("--width must be a whole number from 20 to 1000");
    const pane = widthArg !== undefined ? Number(widthArg) : (s.io.columns ?? 100);
    if (!Number.isInteger(pane) || pane < 20 || pane > 1000)
      throw new UsageError("--width must be a whole number from 20 to 1000");
    const width = layoutWidth(pane, s.config.render.inset);
    const themeName = flag(s.args, "theme") ?? s.config.theme;
    const loaded = loadTheme(themeName);
    if (loaded.warning) s.warnings.push(loaded.warning);
    const { theme, warnings: colorWarnings } = applyColorOverrides(loaded.theme, s.config.colors);
    s.warnings.push(...colorWarnings);
    const glyphArg = flag(s.args, "glyphs");
    if (glyphArg !== undefined && !isGlyphMode(glyphArg))
      throw new UsageError("--glyphs must be auto, nerd, unicode or ascii");
    const glyphMode = (glyphArg as Config["render"]["glyphs"] | undefined) ?? s.config.render.glyphs;
    const showUrls =
      s.config.render.show_urls === "always" || (s.config.render.show_urls === "auto" && depth === "none");
    const layout = layoutNote(parseFile(s, rel, decoded.text), s.graph, rel, {
      width,
      glyphs: glyphsFor(glyphMode, s.io.env),
      showUrls,
    });
    if (decoded.invalidUtf8) s.warnings.push(`${rel}: not valid UTF-8; invalid bytes shown as U+FFFD`);
    return {
      data: {
        path: rel,
        width,
        lines: layout.lines.map((l) =>
          l.spans
            .map((sp) => sp.text)
            .join("")
            .replace(/\s+$/, ""),
        ),
        headings: layout.headings.map((h) => ({ level: h.level, text: h.text, slug: h.slug, line: h.src })),
      },
      human: layoutToAnsi(layout, theme, { depth }),
    };
  },

  /**
   * Notes exported as one document (10.x): a chapter each, in the order given; to `--out` (`-o`), else beside the first
   * with its name; in `--to`'s format, else `--out`'s extension's, else Word's.
   */
  async export(s, rest) {
    if (!rest.length)
      throw new UsageError(
        "export needs a note: slipbox export <note…> [--to docx|pdf|html|epub|md] [--out|-o <path>]",
      );
    const rels = rest.map((r) => resolveNote(s, r));
    const out = flag(s.args, "out");
    // A folder's name (`exports.v2/`, or one there) says no format.
    const folder =
      out !== undefined &&
      (namesFolder(out) || statSync(resolve(s.io.cwd, out), { throwIfNoEntry: false })?.isDirectory() === true);
    const name = flag(s.args, "to") ?? (out && !folder && extname(out) ? extname(out) : "docx");
    const format = formatFor(name);
    if (!format) throw new UsageError(`--to must be one of: ${FORMATS.map((f) => f.name).join(", ")}`);
    let target: string;
    try {
      target = exportTarget(s.graph, rels[0]!, format, out ?? null, s.io.cwd);
    } catch (err) {
      throw new CliError((err as Error).message, EXIT.refused);
    }
    const written = await exportNotes(s.graph, rels, format, target);
    const files = writeExport(target, written).map((f) => s.graph.shownPath(f));
    const shown = s.graph.shownPath(target);
    const beside = files.length ? `, ${files.length} file${files.length === 1 ? "" : "s"} beside it` : "";
    // A note written where the vault never indexes it (D246): Markdown into a folder `walk.exclude` names.
    const left = s.graph.filter.isNoteName(basename(target)) ? notIndexed(s, target) : null;
    return {
      data: {
        path: shown,
        format: format.name,
        notes: rels,
        bytes: written.data.length,
        files,
        ...(left ? { notIndexed: left } : {}),
      },
      human: `exported ${rels.length === 1 ? rels[0] : `${rels.length} notes`} to ${shown} (${format.title}${left ? `, not indexed: ${left}` : ""})${beside}\n`,
    };
  },
};

function colorDepth(s: Session): ColorDepth {
  const c = flag(s.args, "color") ?? "auto";
  if (has(s.args, "plain") || has(s.args, "json") || c === "never") return "none";
  if (c === "always") {
    const d = detectColorDepth(s.io.env, true);
    return d === "none" ? "truecolor" : d;
  }
  if (c !== "auto") throw new UsageError(`--color must be auto, always or never`);
  return detectColorDepth(s.io.env, s.io.isTTY);
}
