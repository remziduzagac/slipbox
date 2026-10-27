import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../../../src/core/application/config/config.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const sandbox = makeCoreSandbox();

describe("document types (22.2, 22.3)", () => {
  test("built in: skill and adr; the config's change a built-in's keys, add their own, and turn one off with no paths", async () => {
    const { docTypes, ofType } = await import("../../../../src/core/documents/model/doctypes.ts");
    expect(docTypes().map((t) => t.name)).toEqual(["adr", "skill"]);
    const t = docTypes({
      skill: { required: ["name", "description", "license"] },
      adr: { paths: [] },
      memory: { paths: ["memory/*.md"], required: ["name"] },
    });
    expect(t.map((x) => [x.name, x.source])).toEqual([
      ["memory", "config"],
      ["skill", "config"],
    ]);
    const skill = t.find((x) => x.name === "skill")!;
    // The built-in's paths and keys kept; only what was given replaced.
    expect(skill.paths).toEqual(["**/SKILL.md"]);
    expect(skill.required).toEqual(["name", "description", "license"]);
    expect(skill.keys).toEqual({ name: "string", description: "string" });
    expect([
      ofType("SKILL.md", skill),
      ofType("skills/a/SKILL.md", skill),
      ofType("skills/a/skill.md", skill),
      ofType("skills/a/SKILL.md.bak", skill),
    ]).toEqual([true, true, false, false]);
    const adr = docTypes().find((x) => x.name === "adr")!;
    expect(
      ["docs/adr/0001-x.md", "adr/0002-y.md", "docs/decisions/0003.md", "docs/adr/sub/0004.md", "docs/adr.md"].map(
        (p) => ofType(p, adr),
      ),
    ).toEqual([true, true, true, false, false]);
  });

  test("frontmatter checked by a type's rules: missing, of another kind, not an allowed value — each at its key's line", async () => {
    const { docTypes, frontmatterProblems } = await import("../../../../src/core/documents/model/doctypes.ts");
    const [memory] = docTypes({
      memory: {
        paths: ["*.md"],
        required: ["name", "description", "metadata.type"],
        keys: { name: "string", created: "date", tags: "list", metadata: "table" },
        values: { "metadata.type": ["user", "feedback"] },
      },
    }).filter((t) => t.name === "memory");
    const at = (text: string) => frontmatterProblems(text, [memory!]).map((p) => `${p.start.line}: ${p.message}`);
    expect(
      at("---\nname: a\ndescription: b\ncreated: 2026-10-10\ntags: [x]\nmetadata:\n  type: user\n---\n# A\n"),
    ).toEqual([]);
    expect(at("---\nname: 42\ncreated: soon\ntags: x\nmetadata:\n  other: 1\n  type: project\n---\n")).toEqual([
      '1: memory: "description" is missing',
      '2: memory: "name" should be a string, not a number',
      '3: memory: "created" should be a date, not text',
      '4: memory: "tags" should be a list, not text',
      '7: memory: "metadata.type" is "project", not one of "user", "feedback"',
    ]);
    // A date is one, not text with one in it; a time after it is still one.
    expect(at("---\nname: a\ndescription: b\ncreated: due 2026-10-10\nmetadata:\n  type: user\n---\n")).toEqual([
      '4: memory: "created" should be a date, not text',
    ]);
    expect(at("---\nname: a\ndescription: b\ncreated: 2026-10-10T09:30:00Z\nmetadata:\n  type: user\n---\n")).toEqual(
      [],
    );
    // Empty counts as missing; a dotted key missing inside its table too.
    expect(at("---\nname: ''\ndescription: d\nmetadata: {}\n---\n")).toEqual([
      '1: memory: "name" is missing',
      '1: memory: "metadata.type" is missing',
    ]);
    // No frontmatter at all; frontmatter that doesn't parse — said, the rules unchecked.
    expect(at("# Just a note\n")).toEqual(["1: a memory note needs frontmatter: name, description, metadata.type"]);
    expect(at("---\nname: [unclosed\n---\n")[0]).toMatch(
      /^1: its frontmatter doesn't parse \(.+\): memory's rules unchecked$/,
    );
    // TOML's (+++), its tables and dates its own.
    expect(at('+++\nname = "a"\ndescription = "b"\ncreated = 2026-10-10\n[metadata]\ntype = "nope"\n+++\n')).toEqual([
      '6: memory: "metadata.type" is "nope", not one of "user", "feedback"',
    ]);
    // A note of no ruled type: nothing.
    expect(
      frontmatterProblems(
        "# x\n",
        docTypes().filter((t) => t.name === "adr"),
      ),
    ).toEqual([]);
  });

  test("a status: the type's key, a Status line (bold or not), or a Status section's first line", async () => {
    const { statusOf } = await import("../../../../src/core/documents/model/doctypes.ts");
    expect(statusOf("---\nstatus: Accepted\n---\n# A\n\nStatus: Draft\n", "status")).toBe("Accepted");
    expect(statusOf("# A\n\nStatus: Superseded by [0007](0007-x.md)\n", "status")).toBe(
      "Superseded by [0007](0007-x.md)",
    );
    expect(statusOf("# A\n\n**Status:** Proposed\n", null)).toBe("Proposed");
    expect(statusOf("# A\n\nStatus: **Accepted**\n", null)).toBe("Accepted");
    expect(statusOf("# A\n\n**Status**: __Deprecated__\n", null)).toBe("Deprecated");
    expect(statusOf("# A\n\n- Status: Rejected\n", null)).toBe("Rejected");
    expect(statusOf("# A\n\n## Status\n\nAccepted\n\n## Context\n", null)).toBe("Accepted");
    expect(statusOf("# A\n\n## Status\n\n## Context\n", null)).toBeNull();
    expect(statusOf("# A\n\nNo state here.\n", "status")).toBeNull();
  });

  test("what supersedes a note: a link from where it is, a wikilink, or a number in the type's own naming", async () => {
    const { supersededBy } = await import("../../../../src/core/documents/model/doctypes.ts");
    const adrs = [
      { path: "docs/adr/0001-a.md", number: 1 },
      { path: "docs/adr/0007-b.md", number: 7 },
    ];
    expect(supersededBy("Superseded by [0007](0007-b.md)", "docs/adr/0001-a.md", adrs)).toBe("docs/adr/0007-b.md");
    expect(supersededBy("Superseded by [the new one](./0007-b.md#context)", "docs/adr/0001-a.md", adrs)).toBe(
      "docs/adr/0007-b.md",
    );
    expect(supersededBy("superseded by [[0007-b]]", "docs/adr/0001-a.md", adrs)).toBe("docs/adr/0007-b.md");
    expect(supersededBy("Superseded by ADR-0007", "docs/adr/0001-a.md", adrs)).toBe("docs/adr/0007-b.md");
    expect(supersededBy("Superseded by D7", "docs/adr/0001-a.md", adrs)).toBe("docs/adr/0007-b.md");
    expect(supersededBy("Superseded by 0009", "docs/adr/0001-a.md", adrs)).toBeNull();
    expect(supersededBy("Accepted", "docs/adr/0001-a.md", adrs)).toBeNull();
    // A type without numbers: the link alone says which.
    const rfcs = [
      { path: "rfcs/old-approach.md", number: null },
      { path: "rfcs/new-approach.md", number: null },
    ];
    expect(supersededBy("Superseded by [the new one](new-approach.md)", "rfcs/old-approach.md", rfcs)).toBe(
      "rfcs/new-approach.md",
    );
    expect(supersededBy("Superseded by [gone](gone.md)", "rfcs/old-approach.md", rfcs)).toBeNull();
  });

  test("a type's notes in order: by number, then path; a status each, and what supersedes it", async () => {
    const { docTypes, notesOfType } = await import("../../../../src/core/documents/model/doctypes.ts");
    const adr = docTypes().find((t) => t.name === "adr")!;
    const files: Record<string, string> = {
      "docs/adr/0010-c.md": "# C\n\nStatus: Accepted\n",
      "docs/adr/0002-b.md": "# B\n\nStatus: Superseded by [0010](0010-c.md)\n",
      "docs/adr/README.md": "# About\n",
      "docs/adr/ADR-0001-a.md": "---\nstatus: Accepted\n---\n# A\n",
      "notes/other.md": "# Other\n",
    };
    const list = notesOfType(
      adr,
      Object.keys(files).map((path) => ({ path, title: path })),
      (rel) => files[rel] ?? null,
    );
    expect(list.map((n) => [n.path, n.number, n.status, n.supersededBy])).toEqual([
      ["docs/adr/ADR-0001-a.md", 1, "Accepted", null],
      ["docs/adr/0002-b.md", 2, "Superseded by [0010](0010-c.md)", "docs/adr/0010-c.md"],
      ["docs/adr/0010-c.md", 10, "Accepted", null],
      ["docs/adr/README.md", null, null, null],
    ]);
  });

  test("[types.<name>] in a config: fields of the wrong kind dropped and said; a folder's types merge over yours by name", () => {
    const dir = mkdtempSync(join(sandbox, "types-cfg-"));
    const user = join(dir, "user.toml");
    writeFileSync(
      user,
      '[types.memory]\npaths = ["memory/*.md"]\nrequired = ["name"]\nkeys = { name = "text" }\nnumber = "("\n',
    );
    const r = loadConfig({ configFile: user });
    expect(r.config.types.memory).toEqual({ paths: ["memory/*.md"], required: ["name"] });
    expect(r.warnings.filter((w) => w.includes("types.memory"))).toHaveLength(2);
    const folder = join(dir, ".slipbox");
    mkdirSync(folder);
    writeFileSync(join(folder, "config.toml"), '[types.memory]\nrequired = ["name", "description"]\n');
    const both = loadConfig({ configFile: user, vaultFile: join(folder, "config.toml") });
    expect(both.config.types.memory).toEqual({ paths: ["memory/*.md"], required: ["name", "description"] });
  });
});
