// A bug report (RPT): what slipbox knows of itself, the system and the terminal, as the bug form asks it (RPT-D1);
// the report's text and how it's read back; the bug form's address filled in from it (RPT-D3). `slipbox report`
// prints the facts (RPT-D5); the report's window (`tui/report.ts`) writes them into its text. Nothing here reaches
// the network: the address is opened, or copied, on your say.

import { readFileSync } from "node:fs";
import { release as kernelRelease } from "node:os";
import { type Channel, installedBy, readChannel } from "./install.ts";
import { dataHome } from "./paths.ts";
import { RELEASE, type ReleaseBuild } from "./release.ts";
import { sanitize } from "./sanitize.ts";
import { isWsl } from "./wsl.ts";
import { VERSION } from "../version.ts";

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
  return line ? (line.length > max ? `${line.slice(0, max - 1)}…` : line) : null;
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
  return oneLine(value("PRETTY_NAME") ?? [value("NAME"), value("VERSION")].filter(Boolean).join(" "));
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
