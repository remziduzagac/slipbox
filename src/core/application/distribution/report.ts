// A bug report (RPT): what slipbox knows of itself, the system and the terminal, as the bug form asks it (RPT-D1);
// the report's text and how it's read back; the bug form's address filled in from it (RPT-D3). `slipbox report`
// prints the facts (RPT-D5); the report's window (`tui/app/distribution/report.ts`) writes them into its text.
// Nothing here reaches the network: the address is opened, or copied, on your say.

import { readFileSync } from "node:fs";
import { release as kernelRelease } from "node:os";
import { type Channel, installedBy, readChannel } from "./install.ts";
import { dataHome } from "../../foundation/platform/paths.ts";
import { RELEASE, type ReleaseBuild } from "./release.ts";
import { sanitize } from "../../foundation/text/sanitize.ts";
import { truncate } from "../../foundation/text/width.ts";
import { isWsl } from "../../foundation/platform/wsl.ts";
import { VERSION } from "../../../version.ts";

/** Where reports go when this slipbox isn't a release that says (RPT-D7): slipbox's own repository. */
export const REPO = "remziduzagac/slipbox";

/** The repository a report goes to: the release's, else slipbox's own (RPT-D7). */
export function reportRepo(release: ReleaseBuild | null = RELEASE): string {
  return release?.repo ?? REPO;
}

/** The bug form's fields (`.github/ISSUE_TEMPLATE/bug_report.yml`), by id, each with its label: the report's
 *  headings. The address fills them by id; the title is the issue's own, with no label. */
export const FORM_FIELDS = [
  { id: "version", label: "Version" },
  { id: "install", label: "Installed with" },
  { id: "platform", label: "Platform" },
  { id: "terminal", label: "Terminal" },
  { id: "happened", label: "What happened" },
  { id: "expected", label: "What you expected" },
  { id: "steps", label: "Steps to make it happen" },
  { id: "output", label: "What slipbox sees" },
] as const;

export type FieldId = (typeof FORM_FIELDS)[number]["id"];

/** The facts' fields, in the form's order. */
export const FACT_IDS = ["version", "install", "platform", "terminal"] as const satisfies readonly FieldId[];
export type FactFields = Record<(typeof FACT_IDS)[number], string>;

export const LABEL: Record<FieldId, string> = Object.fromEntries(FORM_FIELDS.map((f) => [f.id, f.label])) as Record<
  FieldId,
  string
>;

/** What the terminal said of itself, as the TUI's host copies it from OpenTUI (core never imports it). */
export interface TerminalAnswer {
  /** Its name and version as it answered XTVERSION; null when it didn't. */
  name: string | null;
  version: string | null;
  /** The multiplexer OpenTUI found (tmux, zellij, screen); null for none, or one it couldn't name. */
  multiplexer: string | null;
  /** Whether OpenTUI found it's over SSH. */
  remote: boolean;
}

/** How this slipbox was put here: the installer's, Homebrew's, a release's binary put in place another way, or run
 *  from source (or built by hand: no release). */
export type Installed = "installer" | "homebrew" | "other" | "source";

export interface ReportFacts {
  version: string;
  /** The releases it follows: the installer's install's alone (GR-D15). */
  channel: Channel | null;
  installedBy: Installed;
  /** The platform the release was built for (`linux-arm64`); null run from source. */
  release: string | null;
  bun: string;
  system: {
    /** The system's own name and version (`Ubuntu 24.04.1 LTS`, `macOS 15.6`), when it says. */
    name: string | null;
    /** `linux`, `darwin`: Node's name for it. */
    os: string;
    kernel: string;
    arch: string;
    wsl: boolean;
  };
  terminal: {
    /** Its answer to XTVERSION, `ghostty 1.2.0`; the TUI's alone. */
    answer: string | null;
    /** `TERM_PROGRAM`, with its version. */
    program: string | null;
    term: string | null;
    size: { cols: number; rows: number } | null;
    /** Any between it and slipbox, outermost first as found: tmux, zellij, screen, herdsman, herdr. */
    multiplexers: string[];
    /** Only whether: an address is never written. */
    ssh: boolean;
  };
}

/** What the facts are read from: this process's, unless a test says otherwise. */
export interface FactSources {
  version: string;
  release: ReleaseBuild | null;
  execPath: string;
  /** slipbox's data folder, where the installer keeps its versions and channel. */
  data: string;
  bun: string;
  env: Record<string, string | undefined>;
  platform: string;
  arch: string;
  kernel: string;
  /** A file's text, or "" when it can't be read. */
  read: (file: string) => string;
  terminal: TerminalAnswer | null;
  size: { cols: number; rows: number } | null;
}

function readOr(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

export function factSources(over: Partial<FactSources> = {}): FactSources {
  return {
    version: VERSION,
    release: RELEASE,
    execPath: process.execPath,
    data: dataHome(),
    bun: process.versions.bun ?? "",
    env: process.env,
    platform: process.platform,
    arch: process.arch,
    kernel: kernelRelease(),
    read: readOr,
    terminal: null,
    size: null,
    ...over,
  };
}

/** A value from outside — the environment, a file, the terminal's answer — as a report may hold it: sanitized (2.9),
 *  its first line, cut short; null when nothing's left. */
function oneLine(s: string | undefined | null, max = 120): string | null {
  const line = sanitize(s ?? "")
    .split("\n")[0]!
    .trim();
  return line ? truncate(line, max) : null;
}

/** The system's own name and version: Linux's `/etc/os-release`, macOS's `SystemVersion.plist`. */
function systemName(platform: string, read: (file: string) => string): string | null {
  if (platform === "darwin") {
    const plist = read("/System/Library/CoreServices/SystemVersion.plist");
    const key = (k: string) => new RegExp(`<key>${k}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1];
    const name = key("ProductName");
    return name ? oneLine(`${name} ${key("ProductVersion") ?? ""}`) : null;
  }
  const release = read("/etc/os-release") || read("/usr/lib/os-release");
  const value = (k: string) => {
    const v = new RegExp(`^${k}=(.*)$`, "m").exec(release)?.[1]?.trim();
    return v?.replace(/^(["'])(.*)\1$/, "$2");
  };
  return oneLine(value("PRETTY_NAME") || [value("NAME"), value("VERSION")].filter(Boolean).join(" "));
}

/** The multiplexers between the terminal and slipbox, by their own variables: presence only, never a socket's path or
 *  a session's name. */
const MULTIPLEXER_ENV: [string, string][] = [
  ["TMUX", "tmux"],
  ["ZELLIJ", "zellij"],
  ["STY", "screen"],
  ["HERDSMAN_ENV", "herdsman"],
  ["HERDR_ENV", "herdr"],
];

/** Whether it's over SSH, by the variables SSH sets: presence only, since `SSH_CONNECTION` holds addresses. */
export function overSsh(env: Record<string, string | undefined>): boolean {
  return !!(env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY);
}

/** What slipbox knows for a report. */
export function reportFacts(src: FactSources = factSources()): ReportFacts {
  const by: Installed = src.release ? installedBy(src.execPath, src.data, src.version) : "source";
  const env = src.env;
  const t = src.terminal;
  const multiplexers = [
    // OpenTUI's names one it found asking the terminal; its "none" never hides what the environment says.
    ...(t?.multiplexer ? [t.multiplexer] : []),
    ...MULTIPLEXER_ENV.filter(([k]) => env[k]).map(([, name]) => name),
  ].filter((m, i, all) => all.indexOf(m) === i);
  return {
    version: src.version,
    // `readChannel` says stable when there's no file: asked of the installer's install alone.
    channel: by === "installer" ? readChannel(src.data) : null,
    installedBy: by,
    release: src.release?.target ?? null,
    bun: src.bun,
    system: {
      name: systemName(src.platform, src.read),
      os: src.platform,
      kernel: oneLine(src.kernel) ?? "",
      arch: src.arch,
      wsl: src.platform === "linux" && isWsl(env, src.read("/proc/sys/kernel/osrelease")),
    },
    terminal: {
      answer: t?.name ? oneLine(`${t.name} ${t.version ?? ""}`) : null,
      program: oneLine(`${env.TERM_PROGRAM ?? ""} ${env.TERM_PROGRAM ? (env.TERM_PROGRAM_VERSION ?? "") : ""}`),
      term: oneLine(env.TERM),
      size: src.size,
      multiplexers,
      ssh: overSsh(env) || !!t?.remote,
    },
  };
}

/** How it was installed, in the bug form's own words where it has them. */
const INSTALLED_SAID: Record<Installed, string> = {
  installer: "the installer (install.sh)",
  homebrew: "Homebrew",
  other: "a release's binary, put in place by hand",
  source: "from source",
};

/** How it was installed, as Version says it too (the form's dropdown may not fill from the address: RPT-D3). */
const INSTALLED_SHORT: Record<Installed, string> = {
  installer: "the installer's",
  homebrew: "Homebrew's",
  other: "a release put in place by hand",
  source: "from source or built by hand",
};

const OS_NAME: Record<string, string> = { linux: "Linux", darwin: "Darwin" };

/** The facts as the bug form's fields hold them, a line each. */
export function factFields(f: ReportFacts): FactFields {
  const how = [
    INSTALLED_SHORT[f.installedBy],
    f.channel ? `${f.channel} channel` : null,
    f.release ? `${f.release} build` : null,
    f.bun ? `Bun ${f.bun}` : null,
  ];
  const s = f.system;
  const kernel = `${OS_NAME[s.os] ?? s.os} ${s.kernel}`.trim();
  const t = f.terminal;
  const terminal = [
    t.answer,
    t.program ? `TERM_PROGRAM ${t.program}` : null,
    t.term ? `TERM ${t.term}` : null,
    t.size ? `${t.size.cols}×${t.size.rows}` : null,
    t.multiplexers.length ? `inside ${t.multiplexers.join(" and ")}` : null,
    t.ssh ? "over SSH" : null,
  ].filter(Boolean);
  return {
    version: `${f.version} (${how.filter(Boolean).join(", ")})`,
    install: INSTALLED_SAID[f.installedBy],
    platform: `${s.name ? `${s.name}${s.wsl ? " in WSL" : ""} (${kernel})` : `${kernel}${s.wsl ? " (WSL)" : ""}`}, ${s.arch}`,
    terminal: terminal.join(", ") || "not known",
  };
}

/** The facts' sections, as the report holds them and `gh issue create` takes them. */
export function factsMarkdown(fields: FactFields): string {
  return `${FACT_IDS.map((id) => `### ${LABEL[id]}\n\n${fields[id]}`).join("\n\n")}\n`;
}

/** The bug form's address, its fields filled in by id (an empty one left out), encoded as `URLSearchParams` does. No
 *  labels: a reporter can't set them, and the form labels it itself. */
export function formAddress(repo: string, fields: Partial<Record<FieldId | "title", string>>): string {
  const q = new URLSearchParams({ template: "bug_report.yml" });
  for (const id of ["title", ...FORM_FIELDS.map((f) => f.id)] as const) {
    const v = fields[id];
    if (v) q.set(id, v);
  }
  return `https://github.com/${repo}/issues/new?${q}`;
}

// ---------------------------------------------------------------------------------------------
// The report's text (RPT-D1): what's sent is the text as you left it; only the address maps it onto the form's fields,
// by one rule, which also says where an added screen goes (design: § Reading it back).

/** The report's first line: left out of what's sent while it's as generated. */
export const GUIDE =
  "<!-- Nothing has left yet. The next line is the title; ctrl+s sends it all, or adds the screen first. -->";

/** The report as it opens: the guide, the title's line to type on, the form's questions, the facts. */
export function reportText(fields: FactFields): string {
  const ask = ["happened", "expected", "steps"] as const;
  return `${GUIDE}\n\n\n\n${ask.map((id) => `### ${LABEL[id]}\n\n\n\n`).join("")}${factsMarkdown(fields)}`;
}

/** The line the title is typed on, in the text as it opens. */
export const TITLE_LINE = 2;

/** A fence's opening line: its character and length (CommonMark: three or more, indented at most three). */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** A comment opening a line inside a quote or a list item: after its `>`, or its marker and a space. */
const CONTAINED_COMMENT = /^(?: {0,3}(?:>|[-+*] |\d{1,9}[.)] ))+ *<!--/;

const LABEL_ID = new Map<string, FieldId>(FORM_FIELDS.map((f) => [f.label, f.id]));

/** A line that is a form label's heading, outside a fence: its field. */
function labelOf(line: string): FieldId | undefined {
  // Its closing hashes, if any, aren't its text (CommonMark).
  const m = /^### (.+?)(?:\s+#+)?\s*$/.exec(line);
  return m ? LABEL_ID.get(m[1]!) : undefined;
}

export interface ReadBack {
  /** The title: the first line of text before the first label (a comment aside). */
  title: string;
  /** The title's line, or -1, and where in it the title starts (after a comment's end, say). */
  titleLine: number;
  titleCol: number;
  /** Text before the first label that isn't the title: no field holds it, so the address would lose it. */
  stray: boolean;
  /** Each field's text, its sections joined; What slipbox sees with its generated fences taken off. */
  fields: Partial<Record<FieldId, string>>;
  /** Where the last What slipbox sees section is: its heading's line, and the line after its last line of text. */
  seen: { heading: number; end: number } | null;
  /** A fence still open where the text ends: where anything after it belongs isn't clear. */
  openFence: boolean;
  /** A comment (`<!--`) still open where the text ends: GitHub hides everything after it. */
  openComment: boolean;
  /** The screen, and where you were, added: their first lines there, outside any fence (a note's own line that reads
   *  the same, inside an added screen or place, isn't one). */
  added: { screen: boolean; where: boolean };
}

/** The report's text read back, by its lines: headings count only outside fences (`### Version` in a screen is the
 *  screen's); a section is a label's heading to the next one; a heading of your own, or a label renamed, is text of
 *  the section above; a label twice, the two joined; a label deleted, its field empty; the order yours. */
export function readReport(text: string): ReadBack {
  const lines = text.split("\n");
  const parts = new Map<FieldId, string[][]>();
  let fence: { close: RegExp } | null = null;
  let comment = false;
  let current: string[] | null = null;
  let currentId: FieldId | null = null;
  let title = "";
  let titleLine = -1;
  let stray = false;
  let seen: { heading: number; end: number } | null = null;
  const added = { screen: false, where: false };
  let titleCol = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    // A comment (the guide among them: GitHub hides them) opens a line, as an HTML block does — after a quote's `>` or a
    // list item's marker too — and runs to its `-->`; in a line one holds, a later `<!--` opens another. In a
    // paragraph's line, `<!--` is the line's own text (CommonMark), the title's as typed. Nothing in one is a label or
    // opens a fence, nor does the rest of a line one starts — the line is the block's. Above the first label it's no
    // text, neither the title nor text the address would lose; in a section it's the section's, as written.
    let line = raw;
    let cut = 0;
    let html = false;
    if (!fence) {
      if (comment) {
        html = true;
        const end = line.indexOf("-->");
        if (end < 0) line = "";
        else {
          comment = false;
          cut = end + 3;
          line = line.slice(cut);
        }
      }
      while (!comment && /^ {0,3}<!--/.test(line)) {
        html = true;
        // `<!-->` and `<!--->` close themselves.
        const end = line.indexOf("-->", line.indexOf("<!--") + 2);
        if (end < 0) {
          comment = true;
          line = "";
        } else {
          cut += end + 3;
          line = line.slice(end + 3);
        }
      }
      // A comment opening after a quote's `>` or a list item's marker opens an HTML block there too; and in a line one
      // holds, a `<!--` later in it is raw HTML: left open, it hides the rest as surely (CommonMark).
      if (!comment && (html || CONTAINED_COMMENT.test(line))) {
        html = true;
        for (let at = line.indexOf("<!--"); at >= 0; ) {
          const end = line.indexOf("-->", at + 2);
          if (end < 0) {
            comment = true;
            break;
          }
          at = line.indexOf("<!--", end + 3);
        }
      }
    }
    if (!fence && !html) {
      if (SCREEN_LINE.test(raw)) added.screen = true;
      if (raw === WHERE_SAID) added.where = true;
    }
    const id = fence || html ? undefined : labelOf(raw);
    if (id) {
      current = [];
      currentId = id;
      parts.set(id, [...(parts.get(id) ?? []), current]);
      if (id === "output") seen = { heading: i, end: i + 1 };
      continue;
    }
    const fenced = fence !== null;
    if (fence) {
      if (fence.close.test(raw)) fence = null;
    } else if (!html) {
      const open = FENCE_OPEN.exec(raw);
      // A backtick fence's info string never holds a backtick (CommonMark): such a line is text. Closed by a line of
      // its character, at least as long.
      if (open && !(open[1]![0] === "`" && open[2]!.includes("`")))
        fence = { close: new RegExp(`^ {0,3}${open[1]![0] === "`" ? "`" : "~"}{${open[1]!.length},}\\s*$`) };
    }
    if (current) {
      current.push(raw);
      if (currentId === "output" && seen && raw.trim()) seen.end = i + 1;
      continue;
    }
    // Before the first label: the title, and any other text — a fence's lines never the title.
    if (!line.trim()) continue;
    if (titleLine < 0 && !fenced && !fence) {
      title = line.trim();
      titleLine = i;
      // Where the title starts in its line: what's before it there (a comment's end) stays in the body.
      titleCol = cut + (line.length - line.trimStart().length);
    } else stray = true;
  }
  const fields: Partial<Record<FieldId, string>> = {};
  for (const [id, sections] of parts) {
    const joined = sections
      .map((s) => s.join("\n").trim())
      .filter(Boolean)
      .join("\n\n");
    if (joined) fields[id] = id === "output" ? inertFences(unfenceAttachments(joined)) : joined;
  }
  return { title, titleLine, titleCol, stray, fields, seen, openFence: fence !== null, openComment: comment, added };
}

/** What an added screen and place begin with: added is this line being in the text. */
export const SCREEN_INTRO = /^The screen, \d+×\d+, as the report opened:$/m;
export const WHERE_INTRO = /^Where it was:$/m;
const SCREEN_LINE = new RegExp(SCREEN_INTRO.source);

export function screenIntro(cols: number, rows: number): string {
  return `The screen, ${cols}×${rows}, as the report opened:`;
}
export const WHERE_SAID = "Where it was:";

/** Text in a `text` fence longer than any run of backticks in it, so a note's own fences can't end it. */
export function fenced(body: string): string {
  // A loop, not a spread: a minified line can hold more runs than a call's arguments may be.
  let longest = 0;
  for (const m of body.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  const f = "`".repeat(Math.max(3, longest + 1));
  return `${f}text\n${body.replace(/\n+$/, "")}\n${f}`;
}

/** An attachment: its first line, then its text fenced. */
export function attachment(intro: string, body: string): string {
  return `${intro}\n\n${fenced(body)}`;
}

/** What slipbox sees in the form's field, which GitHub puts in a code block of its own (`render: text`): a line that
 *  could end a fence — a note's own, or yours — indented four spaces, which no fence's end may be (CommonMark), so
 *  nothing in it ends that block early, whatever fence GitHub picks. */
function inertFences(text: string): string {
  return text.replace(/^( {0,3})(`{3,}|~{3,})/gm, "    $1$2");
}

/** What slipbox sees for the address: the fences slipbox put around an attachment taken off (the form fences that
 *  field itself); fences you wrote, and the text around them, kept. */
function unfenceAttachments(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    out.push(line);
    if (!(SCREEN_INTRO.test(line) || WHERE_INTRO.test(line))) continue;
    // Its fence, after a blank line: the opening dropped, and the closing of the same length.
    const at = lines[i + 1] === "" ? i + 2 : i + 1;
    const open = /^(`{3,})text$/.exec(lines[at] ?? "");
    if (!open) continue;
    const close = lines.indexOf(open[1]!, at + 1);
    if (close < 0) continue;
    out.push(...lines.slice(i + 1, at), ...lines.slice(at + 1, close));
    i = close;
  }
  return out.join("\n");
}

/**
 * An attachment put into the report: at the end of What slipbox sees as `readReport` finds it, before the next label
 * wherever that section is; with no such section, a new one at the end. Refused while a fence is left open, so it
 * never lands in another field or another fence. One edit: `at`, in the text's UTF-16 offsets, and what goes there.
 */
export function placeAttachment(
  text: string,
  block: string,
  r: ReadBack = readReport(text),
): { at: number; insert: string } | { refused: string } {
  if (r.openFence) return { refused: "a fence is left open in the report: close it first" };
  if (r.openComment) return { refused: "a comment (<!--) is left open in the report: close it with --> first" };
  const lines = text.split("\n");
  const offset = (line: number) => lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
  if (r.seen) {
    // After the section's last text (its heading, if it has none), a blank line between.
    const at = offset(r.seen.end);
    const next = lines[r.seen.end];
    const after = next !== undefined && next.trim() !== "" ? "\n" : "";
    if (at > text.length) return { at: text.length, insert: `${text.endsWith("\n") ? "" : "\n"}\n${block}\n` };
    return { at, insert: `\n${block}\n${after}` };
  }
  // At the text's end, before its last newlines: they stay the end.
  const end = text.replace(/\n*$/, "");
  return { at: end.length, insert: `\n\n### ${LABEL.output}\n\n${block}${end.length < text.length ? "" : "\n"}` };
}

/** The report as it's copied, and as gh posts it: as you left it, the generated guide alone taken out. */
export function sentText(text: string): string {
  const lines = text.split("\n");
  // Wherever it is above the first label: a title typed above it leaves it the guide.
  const first = lines.findIndex((l) => labelOf(l) !== undefined);
  const at = lines.indexOf(GUIDE);
  if (at >= 0 && (first < 0 || at < first)) lines.splice(at, lines[at + 1] === "" ? 2 : 1);
  return lines.join("\n");
}

/** What gh posts: the title, and the text after it, as you left them (the guide out). */
export function postOf(text: string, r: ReadBack = readReport(text)): { title: string; body: string } {
  const lines = text.split("\n");
  // The title's line out of the body, but for what's before the title on it: a comment's end must stay, or the body
  // would open a comment that never closes, and GitHub hide all of it.
  if (r.titleLine >= 0) {
    const before = lines[r.titleLine]!.slice(0, r.titleCol).replace(/\s+$/, "");
    if (before) lines[r.titleLine] = before;
    else lines.splice(r.titleLine, 1);
  }
  return {
    title: r.title,
    body: `${sentText(lines.join("\n"))
      .replace(/^\s*\n/, "")
      .replace(/\s+$/, "")}\n`,
  };
}

// ---------------------------------------------------------------------------------------------
// The address's plan (RPT-D3): what it holds, what it leaves out, and why — measured on the encoded address.

/** At most this many characters, encoded: about 5,500 survive GitHub's sign-in redirect (measured; research.md). */
export const ADDRESS_MAX = 5000;

export interface AddressPlan {
  url: string;
  /** The fields with text that it leaves out, the title among them: each copied by another entry. */
  left: (FieldId | "title")[];
}

/** Why the report as it is makes no address, or null: a fence left open makes where each field ends unclear; text
 *  that belongs to no field would be lost. */
export function noAddress(r: ReadBack): string | null {
  if (r.openComment) return "a comment (<!--) is left open: GitHub hides everything after it — close it with -->";
  if (r.openFence) return "a fence is left open: where each field ends isn't clear — close it";
  if (r.stray) return "text above the first heading belongs to no field: the address would lose it — move it under one";
  return null;
}

/** The address, filled in as far as it fits: every field; else all but What slipbox sees; else the title and the
 *  facts; else the facts; else the template alone. Null when the report makes none (`noAddress`). */
export function addressPlan(repo: string, r: ReadBack, max = ADDRESS_MAX): AddressPlan | null {
  if (noAddress(r)) return null;
  const all: Partial<Record<FieldId | "title", string>> = { title: r.title, ...r.fields };
  const has = (Object.keys(all) as (FieldId | "title")[]).filter((k) => all[k]);
  const steps: (FieldId | "title")[][] = [
    has,
    has.filter((k) => k !== "output"),
    has.filter((k) => k === "title" || (FACT_IDS as readonly string[]).includes(k)),
    has.filter((k) => (FACT_IDS as readonly string[]).includes(k)),
    [],
  ];
  for (const keep of steps) {
    const url = formAddress(repo, Object.fromEntries(keep.map((k) => [k, all[k]])));
    if (url.length <= max || !keep.length) return { url, left: has.filter((k) => !keep.includes(k)) };
  }
  return null;
}
