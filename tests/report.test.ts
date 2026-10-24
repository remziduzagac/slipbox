// A bug report (RPT): the facts slipbox knows, the report's text read back, and the bug form's address.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ADDRESS_MAX,
  addressPlan,
  attachment,
  type FactSources,
  FORM_FIELDS,
  factFields,
  factSources,
  factsMarkdown,
  fenced,
  formAddress,
  GUIDE,
  placeAttachment,
  postOf,
  REPO,
  readReport,
  reportFacts,
  reportRepo,
  reportText,
  SCREEN_INTRO,
  screenIntro,
  sentText,
  TITLE_LINE,
  WHERE_SAID,
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

const FIELDS = { version: "0.5.1 (from source)", install: "from source", platform: "Linux", terminal: "TERM xterm" };

/** The report as it opens, with what's typed: the title, and each question's text by its label. */
function typed(title: string, answers: Record<string, string> = {}): string {
  const lines = reportText(FIELDS).split("\n");
  lines[TITLE_LINE] = title;
  let text = lines.join("\n");
  for (const [label, answer] of Object.entries(answers))
    text = text.replace(`### ${label}\n\n`, `### ${label}\n\n${answer}`);
  return text;
}

/** An attachment put in, as the window puts it: one edit. */
function add(text: string, block: string): string {
  const p = placeAttachment(text, block);
  if ("refused" in p) throw new Error(p.refused);
  return text.slice(0, p.at) + p.insert + text.slice(p.at);
}

const SCREEN = attachment(screenIntro(80, 24), "slipbox · home.md\n### Version\n```js\nlet x = 1\n```");

describe("the report's text (RPT-D1)", () => {
  test("it opens with the guide, the title's line, the form's questions and the facts", () => {
    const text = reportText(FIELDS);
    const lines = text.split("\n");
    expect(lines[0]).toBe(GUIDE);
    expect(lines[TITLE_LINE]).toBe("");
    expect(text).toContain("### What happened\n\n\n\n### What you expected\n\n\n\n### Steps to make it happen\n");
    expect(text.endsWith(factsMarkdown(FIELDS))).toBe(true);
    // Nothing of the screen or the place in it.
    expect(text).not.toContain("What slipbox sees");
    const r = readReport(text);
    expect([r.title, r.stray, r.seen, r.openFence]).toEqual(["", false, null, false]);
    expect(r.fields).toEqual(FIELDS);
  });
});

describe("reading it back", () => {
  test("headings count only outside fences: a screen holding ### Version is the screen's", () => {
    const r = readReport(add(typed("It froze", { "What happened": "nothing drew" }), SCREEN));
    expect(r.fields.version).toBe(FIELDS.version);
    expect(r.fields.output).toContain("### Version");
    expect(r.fields.happened).toBe("nothing drew");
    // In a tilde fence too, and a longer one.
    const tilde = readReport(`T\n\n### What happened\n\n~~~~\n### Version\n~~~\n~~~~\n`);
    expect(tilde.fields).toEqual({ happened: "~~~~\n### Version\n~~~\n~~~~" });
  });

  test("a label renamed is text of the section above; deleted, its field empty; doubled, joined; reordered, kept", () => {
    const renamed = readReport(typed("T", { "What happened": "a" }).replace("### What you expected", "### Expected"));
    expect(renamed.fields.happened).toBe("a\n\n### Expected");
    expect(renamed.fields.expected).toBeUndefined();
    const deleted = readReport(typed("T").replace("### Platform\n\nLinux\n\n", ""));
    expect(deleted.fields.platform).toBeUndefined();
    expect(deleted.fields.install).toBe("from source");
    const doubled = readReport(`${typed("T", { "What happened": "first" })}\n### What happened\n\nsecond\n`);
    expect(doubled.fields.happened).toBe("first\n\nsecond");
    const reordered = readReport("T\n\n### Terminal\n\nkitty\n\n### What happened\n\nit broke\n");
    expect(reordered.fields).toEqual({ terminal: "kitty", happened: "it broke" });
    // A heading of one's own is text of its section.
    const own = readReport("T\n\n### What happened\n\na\n\n### Logs\n\nb\n");
    expect(own.fields.happened).toBe("a\n\n### Logs\n\nb");
  });

  test("the title, and text before the first label that no field holds", () => {
    expect(readReport(typed("  Crash on open  ")).title).toBe("Crash on open");
    const stray = readReport(typed("Crash").replace("Crash\n", "Crash\nmore words\n"));
    expect([stray.title, stray.stray]).toEqual(["Crash", true]);
    // No title, no label: everything is stray but the first line.
    expect(readReport("just words\nand more\n").stray).toBe(true);
    expect(readReport("").title).toBe("");
  });

  test("the guide: left out as generated; edited, kept as text, but a comment is never the title or stray", () => {
    const edited = typed("Crash").replace("Nothing has left yet.", "Nothing yet.");
    const r = readReport(edited);
    expect([r.title, r.stray]).toEqual(["Crash", false]);
    expect(sentText(edited).startsWith("<!-- Nothing yet.")).toBe(true);
    expect(sentText(typed("Crash")).startsWith("Crash\n\n### What happened")).toBe(true);
    // A comment over lines too.
    expect(readReport("<!-- one\ntwo -->\nTitle\n### What happened\n").title).toBe("Title");
  });

  test("What slipbox sees: slipbox's fences taken off for the address, yours and the text around them kept", () => {
    const mine = "my words\n\n```sh\nslipbox doctor\n```";
    const text = add(typed("T").replace(/\n$/, `\n\n### What slipbox sees\n\n${mine}\n`), SCREEN);
    const out = readReport(text).fields.output!;
    expect(out.startsWith(`${mine}\n\nThe screen, 80×24, as the report opened:\n\nslipbox · home.md`)).toBe(true);
    expect(out).not.toContain("````");
    expect(out).toContain("```js\nlet x = 1\n```");
    expect(out).toContain("```sh\nslipbox doctor\n```");
  });
});

describe("adding the screen or the place (RPT-D2)", () => {
  test("fenced past a note's own fences, under its first line", () => {
    expect(fenced("a\n```\nb\n```")).toBe("````text\na\n```\nb\n```\n````");
    expect(fenced("plain")).toBe("```text\nplain\n```");
    expect(fenced("x ````````` y")).toStartWith("``````````text\n");
    expect(attachment(WHERE_SAID, "notes/a.md:3")).toBe("Where it was:\n\n```text\nnotes/a.md:3\n```");
  });

  test("with no What slipbox sees, a new section at the end; once there, at its end", () => {
    const one = add(typed("T"), SCREEN);
    expect(one.endsWith(`### Terminal\n\nTERM xterm\n\n### What slipbox sees\n\n${SCREEN}\n`)).toBe(true);
    const where = attachment(WHERE_SAID, "home.md:1");
    const two = add(one, where);
    expect(two.endsWith(`### What slipbox sees\n\n${SCREEN}\n\n${where}\n`)).toBe(true);
    expect(SCREEN_INTRO.test(two)).toBe(true);
    // Each a single edit, at the end of the text.
    const p = placeAttachment(one, where);
    expect("at" in p && p.at).toBe(one.length);
  });

  test("into an edited draft: What slipbox sees in the middle, after a heading of your own, empty", () => {
    const middle = "T\n\n### What happened\n\na\n\n### What slipbox sees\n\nmine\n\n### Version\n\n1\n";
    const m = add(middle, SCREEN);
    expect(m).toBe(`T\n\n### What happened\n\na\n\n### What slipbox sees\n\nmine\n\n${SCREEN}\n\n### Version\n\n1\n`);
    expect(readReport(m).fields.version).toBe("1");
    const own = "T\n\n### What slipbox sees\n\nmine\n\n### Logs\n\nlog\n### Version\n\n1\n";
    expect(add(own, SCREEN)).toBe(
      `T\n\n### What slipbox sees\n\nmine\n\n### Logs\n\nlog\n\n${SCREEN}\n\n### Version\n\n1\n`,
    );
    const empty = "T\n\n### What slipbox sees\n### Version\n\n1";
    expect(add(empty, SCREEN)).toBe(`T\n\n### What slipbox sees\n\n${SCREEN}\n\n### Version\n\n1`);
    // Doubled: the last.
    const twice = "### What slipbox sees\n\na\n\n### Version\n\n1\n\n### What slipbox sees\n\nb";
    expect(add(twice, SCREEN)).toBe(
      `### What slipbox sees\n\na\n\n### Version\n\n1\n\n### What slipbox sees\n\nb\n\n${SCREEN}\n`,
    );
  });

  test("refused while a fence is left open, anywhere", () => {
    const open = typed("T", { "What happened": "```\nunclosed" });
    expect(readReport(open).openFence).toBe(true);
    expect(placeAttachment(open, SCREEN)).toEqual({ refused: "a fence is left open in the report: close it first" });
  });
});

describe("sent as written", () => {
  test("the copy and gh's body keep renamed, doubled and moved headings as they are; the title is gh's own", () => {
    const text = `${GUIDE}\n\nCrash\n\n### Terminal\n\nkitty\n\n### What happened\n\na\n\n### Expected\n\nb\n\n### What happened\n\nc\n`;
    expect(sentText(text)).toBe(text.slice(GUIDE.length + 2));
    const post = postOf(text);
    expect(post.title).toBe("Crash");
    expect(post.body).toBe(
      "### Terminal\n\nkitty\n\n### What happened\n\na\n\n### Expected\n\nb\n\n### What happened\n\nc\n",
    );
  });
});

describe("the address's plan (RPT-D3)", () => {
  const plan = (text: string, max?: number) => addressPlan("me/slipbox", readReport(text), max)!;
  const params = (url: string) => [...new URL(url).searchParams.keys()];

  test("every field by id, encoded, while it fits", () => {
    const text = add(typed("Crash & burn", { "What happened": "100% broke\n\n#1" }), SCREEN);
    const p = plan(text);
    expect(p.left).toEqual([]);
    expect(params(p.url)).toEqual([
      "template",
      "title",
      "version",
      "install",
      "platform",
      "terminal",
      "happened",
      "output",
    ]);
    expect(new URL(p.url).searchParams.get("happened")).toBe("100% broke\n\n#1");
    expect(p.url.length).toBeLessThanOrEqual(ADDRESS_MAX);
  });

  test("each step of the plan: all but What slipbox sees, the title and facts, the facts, the template", () => {
    const big = attachment(screenIntro(80, 24), "x".repeat(6000));
    const p1 = plan(add(typed("T", { "What happened": "a" }), big));
    expect(p1.left).toEqual(["output"]);
    expect(params(p1.url)).toContain("happened");
    const p2 = plan(typed("T", { "What happened": "é".repeat(2000) }));
    expect(p2.left).toEqual(["happened"]);
    expect(params(p2.url)).toEqual(["template", "title", "version", "install", "platform", "terminal"]);
    const p3 = plan(typed("é".repeat(1000), { "What happened": "a" }), 4000);
    expect(p3.left).toEqual(["title", "happened"]);
    const p4 = plan(typed("T").replace("TERM xterm", "y".repeat(6000)));
    expect(p4.left).toEqual(["title", "version", "install", "platform", "terminal"]);
    expect(params(p4.url)).toEqual(["template"]);
  });

  test("text that belongs to no field: no address, since it would be lost", () => {
    expect(addressPlan("me/slipbox", readReport(typed("T").replace("T\n", "T\nstray\n")))).toBeNull();
  });
});
