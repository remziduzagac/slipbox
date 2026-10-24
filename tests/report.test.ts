// A bug report (RPT): the facts slipbox knows, the report's text read back, and the bug form's address.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type FactSources,
  FORM_FIELDS,
  factFields,
  factSources,
  factsMarkdown,
  formAddress,
  REPO,
  reportFacts,
  reportRepo,
} from "../src/core/report.ts";

const OS_RELEASE = 'NAME="Ubuntu"\nVERSION="24.04.1 LTS (Noble Numbat)"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\nID=ubuntu\n';
const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>ProductBuildVersion</key>
  <string>24G84</string>
  <key>ProductName</key>
  <string>macOS</string>
  <key>ProductVersion</key>
  <string>15.6</string>
</dict></plist>`;

/** A Linux machine with nothing between its terminal and slipbox, run from source, unless a test says otherwise. */
function sources(over: Partial<FactSources> = {}, files: Record<string, string> = {}): FactSources {
  const read = (f: string) => ({ "/etc/os-release": OS_RELEASE, ...files })[f] ?? "";
  return factSources({
    version: "0.5.1",
    release: null,
    execPath: "/usr/bin/bun",
    data: "/nowhere",
    bun: "1.4.2",
    env: { TERM: "xterm-256color" },
    platform: "linux",
    arch: "arm64",
    kernel: "6.8.0-45-generic",
    read,
    terminal: null,
    size: null,
    ...over,
  });
}

/** A data folder the installer laid out: `versions/<version>/slipbox`, and the channel it follows. */
function installerData(version: string, channel?: string): { data: string; exec: string } {
  const data = mkdtempSync(join(tmpdir(), "slipbox-report-"));
  mkdirSync(join(data, "versions", version), { recursive: true });
  const exec = join(data, "versions", version, "slipbox");
  writeFileSync(exec, "");
  if (channel) writeFileSync(join(data, "channel"), `${channel}\n`);
  return { data, exec };
}

const RELEASE = { repo: "someone/slipbox", target: "linux-arm64" };

describe("the facts (RPT-D1)", () => {
  test("run from source: no release, no channel, said so in Version and in the form's own words", () => {
    const f = reportFacts(sources());
    expect(f.installedBy).toBe("source");
    expect(f.channel).toBeNull();
    expect(f.release).toBeNull();
    const fields = factFields(f);
    expect(fields.version).toBe("0.5.1 (from source or built by hand, Bun 1.4.2)");
    expect(fields.install).toBe("from source");
  });

  test("the installer's install: its channel, stable or preview, and the release's platform", () => {
    const stable = installerData("0.5.1");
    const f = reportFacts(sources({ release: RELEASE, execPath: stable.exec, data: stable.data }));
    expect([f.installedBy, f.channel, f.release]).toEqual(["installer", "stable", "linux-arm64"]);
    expect(factFields(f).version).toBe("0.5.1 (the installer's, stable channel, linux-arm64 build, Bun 1.4.2)");
    expect(factFields(f).install).toBe("the installer (install.sh)");
    const preview = installerData("0.5.1", "preview");
    const p = reportFacts(sources({ release: RELEASE, execPath: preview.exec, data: preview.data }));
    expect(p.channel).toBe("preview");
    expect(factFields(p).version).toContain("preview channel");
  });

  test("Homebrew's: no channel, even with a channel file the installer left", () => {
    const left = installerData("0.4.0", "preview");
    const cellar = join(left.data, "Cellar", "slipbox", "0.5.1", "bin");
    mkdirSync(cellar, { recursive: true });
    writeFileSync(join(cellar, "slipbox"), "");
    const f = reportFacts(sources({ release: RELEASE, execPath: join(cellar, "slipbox"), data: left.data }));
    expect([f.installedBy, f.channel]).toEqual(["homebrew", null]);
    expect(factFields(f).install).toBe("Homebrew");
    expect(factFields(f).version).toBe("0.5.1 (Homebrew's, linux-arm64 build, Bun 1.4.2)");
  });

  test("a release's binary put in place by hand: no channel, said in words of its own", () => {
    const left = installerData("0.4.0", "preview");
    const f = reportFacts(sources({ release: RELEASE, execPath: "/opt/slipbox", data: left.data }));
    expect([f.installedBy, f.channel]).toEqual(["other", null]);
    expect(factFields(f).install).toBe("a release's binary, put in place by hand");
    expect(factFields(f).version).toContain("a release put in place by hand");
  });

  test("the installer's, run through the link it made", () => {
    const { data, exec } = installerData("0.5.1");
    const link = join(data, "slipbox");
    symlinkSync(exec, link);
    expect(reportFacts(sources({ release: RELEASE, execPath: link, data })).installedBy).toBe("installer");
  });

  test("the platform: Linux's os-release, macOS's SystemVersion.plist, WSL", () => {
    expect(factFields(reportFacts(sources())).platform).toBe("Ubuntu 24.04.1 LTS (Linux 6.8.0-45-generic), arm64");
    const mac = sources(
      { platform: "darwin", arch: "arm64", kernel: "24.6.0" },
      { "/System/Library/CoreServices/SystemVersion.plist": PLIST },
    );
    expect(factFields(reportFacts(mac)).platform).toBe("macOS 15.6 (Darwin 24.6.0), arm64");
    const wsl = sources(
      { kernel: "5.15.167.4-microsoft-standard-WSL2", arch: "x64" },
      { "/proc/sys/kernel/osrelease": "5.15.167.4-microsoft-standard-WSL2\n" },
    );
    expect(reportFacts(wsl).system.wsl).toBe(true);
    expect(factFields(reportFacts(wsl)).platform).toBe(
      "Ubuntu 24.04.1 LTS in WSL (Linux 5.15.167.4-microsoft-standard-WSL2), x64",
    );
    // WSL by its own variable, and a system that names itself no way: its kernel alone.
    const bare = sources({ env: { WSL_DISTRO_NAME: "Debian" } }, { "/etc/os-release": "" });
    expect(factFields(reportFacts(bare)).platform).toBe("Linux 6.8.0-45-generic (WSL), arm64");
    // os-release without PRETTY_NAME: its name and version.
    const named = sources({}, { "/etc/os-release": 'NAME=Fedora\nVERSION="41 (Workstation Edition)"\n' });
    expect(reportFacts(named).system.name).toBe("Fedora 41 (Workstation Edition)");
  });

  test("the terminal: its answer, TERM_PROGRAM and its version, TERM, the size", () => {
    const f = reportFacts(
      sources({
        env: { TERM: "xterm-ghostty", TERM_PROGRAM: "ghostty", TERM_PROGRAM_VERSION: "1.2.0" },
        terminal: { name: "ghostty", version: "1.2.0", multiplexer: null, remote: false },
        size: { cols: 236, rows: 60 },
      }),
    );
    expect(factFields(f).terminal).toBe("ghostty 1.2.0, TERM_PROGRAM ghostty 1.2.0, TERM xterm-ghostty, 236×60");
    // TERM_PROGRAM_VERSION alone says nothing.
    const alone = reportFacts(sources({ env: { TERM: "xterm", TERM_PROGRAM_VERSION: "3.5" } }));
    expect(alone.terminal.program).toBeNull();
    expect(factFields(reportFacts(sources({ env: {} }))).terminal).toBe("not known");
  });

  test("the multiplexers: OpenTUI's, and each the environment names, by presence alone", () => {
    const env = (e: Record<string, string>) => factFields(reportFacts(sources({ env: e }))).terminal;
    expect(env({ TMUX: "/tmp/tmux-501/default,1234,0" })).toBe("inside tmux");
    expect(env({ ZELLIJ: "0", ZELLIJ_SESSION_NAME: "secret-session" })).toBe("inside zellij");
    expect(env({ STY: "1234.pts-0.host" })).toBe("inside screen");
    expect(env({ HERDSMAN_ENV: "1" })).toBe("inside herdsman");
    expect(env({ HERDR_ENV: "1" })).toBe("inside herdr");
    expect(env({ TMUX: "/tmp/x", HERDSMAN_ENV: "1" })).toBe("inside tmux and herdsman");
    const values: Record<string, string>[] = [{ TMUX: "/tmp/tmux-501/default,1234,0" }, { STY: "1234.pts-0.host" }];
    for (const e of values) expect(env(e)).not.toContain(Object.values(e)[0]!);
    // OpenTUI's own, once, and its "none" never hides the environment's.
    const opentui = (multiplexer: string | null, e: Record<string, string> = {}) =>
      reportFacts(sources({ env: e, terminal: { name: null, version: null, multiplexer, remote: false } })).terminal
        .multiplexers;
    expect(opentui("tmux")).toEqual(["tmux"]);
    expect(opentui("tmux", { TMUX: "/tmp/x" })).toEqual(["tmux"]);
    expect(opentui(null, { ZELLIJ: "0" })).toEqual(["zellij"]);
  });

  test("SSH: by each of its variables, or OpenTUI's finding, and never a value", () => {
    for (const k of ["SSH_CONNECTION", "SSH_CLIENT", "SSH_TTY"]) {
      const value = k === "SSH_TTY" ? "/dev/pts/7" : "203.0.113.9 52144 198.51.100.4 22";
      const fields = factFields(reportFacts(sources({ env: { [k]: value } })));
      expect(fields.terminal).toBe("over SSH");
      expect(JSON.stringify(fields)).not.toContain("203.0.113.9");
      expect(JSON.stringify(fields)).not.toContain("/dev/pts/7");
    }
    const remote = { name: null, version: null, multiplexer: null, remote: true };
    expect(reportFacts(sources({ env: {}, terminal: remote })).terminal.ssh).toBe(true);
  });

  test("a value with escapes, or lines, is sanitized to one line", () => {
    const f = reportFacts(
      sources(
        { env: { TERM: "xterm\x1b]0;owned\x07-256color", TERM_PROGRAM: "evil\nsecond line" } },
        { "/etc/os-release": 'PRETTY_NAME="Distro\x1b[31m 1"\n' },
      ),
    );
    const all = JSON.stringify(factFields(f));
    expect(all).not.toContain("\\u001b");
    expect(all).not.toContain("second line");
    expect(f.terminal.term).toBe("xterm-256color");
    expect(f.system.name).toBe("Distro 1");
  });

  test("the facts' sections, under the bug form's labels", () => {
    const md = factsMarkdown(factFields(reportFacts(sources())));
    expect(md).toBe(
      "### Version\n\n0.5.1 (from source or built by hand, Bun 1.4.2)\n\n### Installed with\n\nfrom source\n\n" +
        "### Platform\n\nUbuntu 24.04.1 LTS (Linux 6.8.0-45-generic), arm64\n\n### Terminal\n\nTERM xterm-256color\n",
    );
  });
});

describe("the bug form (RPT-D3)", () => {
  test("its fields are the form's own, by id and label", () => {
    const yml = readFileSync(join(import.meta.dir, "..", ".github", "ISSUE_TEMPLATE", "bug_report.yml"), "utf8");
    const form = [...yml.matchAll(/^ {4}id: (\S+)\n {4}attributes:\n {6}label: (.+)$/gm)].map((m) => ({
      id: m[1],
      label: m[2],
    }));
    expect(form).toEqual(FORM_FIELDS.map((f) => ({ id: f.id, label: f.label })));
  });

  test("the address: each field by id, encoded, an empty one left out, no labels", () => {
    const url = formAddress("me/slipbox", { title: "a & b", version: "0.5.1 (x)", happened: "", steps: "1. a\n2. b" });
    expect(url.startsWith("https://github.com/me/slipbox/issues/new?template=bug_report.yml&")).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("title")).toBe("a & b");
    expect(q.get("version")).toBe("0.5.1 (x)");
    expect(q.get("steps")).toBe("1. a\n2. b");
    expect(q.has("happened")).toBe(false);
    expect(q.has("labels")).toBe(false);
  });

  test("the repository: the release's, else slipbox's own (RPT-D7)", () => {
    expect(reportRepo(RELEASE)).toBe("someone/slipbox");
    expect(reportRepo(null)).toBe(REPO);
  });
});
