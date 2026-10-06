// Drafts the next CHANGELOG section from merged pull-request titles (CommonJS, run with tsx).
// Usage: npx tsx scripts/changelog.cts v2.3.0..HEAD > /tmp/section.md, then edit by hand: see CONTRIBUTING.md.
const { execFileSync } = require("node:child_process");

type Entry = { kind: "Added" | "Changed" | "Fixed"; title: string; pr: number };

const KINDS: Record<string, Entry["kind"]> = { feat: "Added", fix: "Fixed", refactor: "Changed", perf: "Changed" };

function entries(range: string): Entry[] {
  const log = execFileSync("git", ["log", "--merges", "--format=%s", range], { encoding: "utf8" });
  return log
    .split("\n")
    .map((line: string) => /^Merge pull request #(\d+) from [^ ]+ (\w+): (.+)$/.exec(line))
    .filter((m: RegExpExecArray | null): m is RegExpExecArray => m !== null && m[2]! in KINDS)
    .map((m: RegExpExecArray) => ({ kind: KINDS[m[2]!]!, title: m[3]!, pr: Number(m[1]) }));
}

function section(list: Entry[]): string {
  const out: string[] = [];
  for (const kind of ["Added", "Changed", "Fixed"] as const) {
    const items = list.filter((e) => e.kind === kind);
    if (items.length) out.push(`### ${kind}`, "", ...items.map((e) => `- ${e.title} (#${e.pr})`), "");
  }
  return out.join("\n");
}

process.stdout.write(section(entries(process.argv[2] ?? "HEAD~50..HEAD")));
