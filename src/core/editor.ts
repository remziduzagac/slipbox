// Handing a note to another editor (plans 4.1, 4.2, 4.12). A template is split into argv here and
// `{file}` / `{line}` are filled in inside each argument — never through a shell (13.2), so a file
// name can't become a command.

/** Split a command template into arguments: whitespace separates, '…' and "…" group. */
export function splitCommand(template: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let has = false;
  for (const ch of template) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = "";
      has = false;
    } else cur += ch;
  }
  if (has || cur) out.push(cur);
  return out;
}

/** Editors that take `+LINE FILE`, and those that take `FILE:LINE`. */
const PLUS_LINE = new Set(["vi", "vim", "nvim", "gvim", "mvim", "view", "nano", "pico", "emacs", "emacsclient", "kak", "mg", "joe", "jed"]);
const FILE_COLON_LINE = new Set(["hx", "helix", "micro"]);

/**
 * The argv to edit `file` at `line`. With a template, it is used as written. Without one,
 * `$VISUAL`, else `$EDITOR`, else `vi`, with the line passed the way that editor understands (a
 * known editor), or just the file (an unknown one).
 */
export function editorArgv(template: string, file: string, line: number, env: Record<string, string | undefined> = process.env, appendFile = true, server = ""): string[] {
  // One pass: a path that itself contains "{line}" or "{server}" stays the path.
  const values: Record<string, string> = { file, line: String(line), server };
  const fill = (arg: string) => arg.replace(/\{(file|line|server)\}/g, (_, k: string) => values[k]!);
  if (template.trim()) {
    const argv = splitCommand(template).map(fill);
    // A template without {file} still gets the file, last (not for a remote command that only
    // sends keys, like nvim's --remote-send).
    return template.includes("{file}") || !appendFile ? argv : [...argv, file];
  }
  const base = splitCommand(env.VISUAL?.trim() || env.EDITOR?.trim() || "vi");
  const name = (base[0] ?? "vi").split("/").pop()!;
  if (PLUS_LINE.has(name)) return [...base, `+${line}`, file];
  if (FILE_COLON_LINE.has(name)) return [...base, `${file}:${line}`];
  return [...base, file];
}
