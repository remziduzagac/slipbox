import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

/** A disk of these files and nothing else: `read` as the width's search reads, by absolute path. */
const disk = (files: Record<string, string>) => (path: string) => files[path] ?? null;
const NOTE = "/v/docs/guide/note.md";
const HOME = "/home/sam";

describe("the width reflow wraps to (EG-D12)", () => {
  const width = async (files: Record<string, string>, configured = 0, abs = NOTE, root = "/v") => {
    const { textWidthFor } = await import("../../../../src/core/documents/editing/reflow-width.ts");
    return textWidthFor(abs, root, configured, disk(files), HOME);
  };

  test("editor.text_width first; else markdownlint's MD013 line_length; else .editorconfig's; else 80", async () => {
    const lint = { "/v/.markdownlint-cli2.jsonc": '{ "config": { "MD013": { "line_length": 120 } } }' };
    const ec = { "/v/.editorconfig": "root = true\n[*.md]\nmax_line_length = 100\n" };
    expect(await width({ ...lint, ...ec }, 72)).toEqual({ width: 72, from: "editor.text_width" });
    expect(await width({ ...lint, ...ec })).toEqual({ width: 120, from: "/v/.markdownlint-cli2.jsonc" });
    expect(await width(ec)).toEqual({ width: 100, from: ".editorconfig" });
    expect(await width({})).toEqual({ width: 80, from: "the default" });
    // .editorconfig's "off", or a section for other files, says nothing.
    expect(await width({ "/v/.editorconfig": "root = true\n[*]\nmax_line_length = off\n" })).toEqual({
      width: 80,
      from: "the default",
    });
    expect(await width({ "/v/.editorconfig": "root = true\n[*.py]\nmax_line_length = 88\n" })).toEqual({
      width: 80,
      from: "the default",
    });
  });

  test("markdownlint's configs read as data: JSONC with comments and trailing commas, JSON, YAML; the rule by its name too", async () => {
    const at = (name: string, text: string) => width({ [`/v/${name}`]: text });
    expect(
      await at(
        ".markdownlint-cli2.jsonc",
        '// ours\n{ "config": { "default": true, "MD013": { "line_length": 110, }, }, }',
      ),
    ).toEqual({ width: 110, from: "/v/.markdownlint-cli2.jsonc" });
    expect(await at(".markdownlint-cli2.yaml", "config:\n  MD013:\n    line_length: 90\n")).toMatchObject({
      width: 90,
    });
    expect(await at(".markdownlint.json", '{ "line-length": { "line_length": 100 } }')).toMatchObject({ width: 100 });
    expect(await at(".markdownlint.jsonc", '{ "md013": { "line_length": 99 } } // lower case')).toMatchObject({
      width: 99,
    });
    expect(await at(".markdownlint.yaml", "MD013:\n  line_length: 72\n")).toMatchObject({ width: 72 });
    expect(await at(".markdownlint.yml", "MD013: { line_length: 76 }\n")).toMatchObject({ width: 76 });
    // A markdownlint-cli2 config's rules are under `config`: one at its top is no rule of its.
    expect(await at(".markdownlint-cli2.jsonc", '{ "MD013": { "line_length": 50 } }')).toMatchObject({ width: 80 });
    // One that doesn't parse says nothing.
    expect(await at(".markdownlint.json", "{ not json")).toMatchObject({ width: 80 });
  });

  test("a config that's code is never read as one; a length left at the default says nothing; MD013 off says none", async () => {
    const ec = { "/v/.editorconfig": "root = true\n[*]\nmax_line_length = 100\n" };
    // A .mjs or .cjs config is code: passed over, so the data one beside it, else .editorconfig, says.
    expect(
      await width({ ...ec, "/v/.markdownlint-cli2.mjs": "export default { config: { MD013: { line_length: 60 } } };" }),
    ).toEqual({
      width: 100,
      from: ".editorconfig",
    });
    expect(
      await width({
        "/v/.markdownlint.cjs": "module.exports = { MD013: { line_length: 60 } };",
        "/v/.markdownlint.yaml": "MD013:\n  line_length: 70\n",
      }),
    ).toMatchObject({ width: 70 });
    // On, at markdownlint's own default: nothing said, the next asked.
    expect(await width({ ...ec, "/v/.markdownlint.json": '{ "default": true, "MD013": true }' })).toMatchObject({
      width: 100,
    });
    // Off: markdownlint has no length, so .editorconfig's is taken — even where a config farther up states one.
    expect(
      await width({
        ...ec,
        "/v/.markdownlint.json": '{ "MD013": { "line_length": 120 } }',
        "/v/docs/.markdownlint.json": '{ "MD013": false }',
      }),
    ).toMatchObject({ width: 100 });
  });

  test("nearest first, from the file's folder to the vault's top; then your own where the vault has none", async () => {
    const top = { "/v/.markdownlint-cli2.jsonc": '{ "config": { "MD013": { "line_length": 120 } } }' };
    const near = { "/v/docs/.markdownlint.yaml": "MD013:\n  line_length: 100\n" };
    const silent = { "/v/docs/guide/.markdownlint.json": '{ "MD033": false }' };
    expect(await width({ ...top, ...near, ...silent })).toEqual({ width: 100, from: "/v/docs/.markdownlint.yaml" });
    expect(await width({ ...top, ...silent })).toEqual({ width: 120, from: "/v/.markdownlint-cli2.jsonc" });
    // Above the vault's top isn't asked.
    expect(await width({ "/.markdownlint.json": '{ "MD013": { "line_length": 66 } }' })).toMatchObject({ width: 80 });
    // ~/.markdownlint-cli2.jsonc where the vault has no config of its own, as the linter runs then.
    const yours = { [`${HOME}/.markdownlint-cli2.jsonc`]: '{ "config": { "MD013": { "line_length": 88 } } }' };
    expect(await width(yours)).toEqual({ width: 88, from: `${HOME}/.markdownlint-cli2.jsonc` });
    expect(await width({ ...yours, "/v/.markdownlint.json": '{ "MD033": false }' })).toMatchObject({ width: 80 });
    // Your home folder the vault: its configs are the vault's, in markdownlint's order.
    const own = { [`${HOME}/.markdownlint.yaml`]: "MD013:\n  line_length: 70\n" };
    expect(await width(own, 0, `${HOME}/notes/a.md`, HOME)).toEqual({ width: 70, from: `${HOME}/.markdownlint.yaml` });
    // A file outside the vault: its own folder alone, then yours.
    expect(
      await width(
        { ...yours, "/elsewhere/.markdownlint.json": '{ "MD013": { "line_length": 64 } }' },
        0,
        "/elsewhere/a/b.md",
      ),
    ).toMatchObject({
      width: 88,
    });
    expect(
      await width({ "/elsewhere/a/.markdownlint.json": '{ "MD013": { "line_length": 64 } }' }, 0, "/elsewhere/a/b.md"),
    ).toMatchObject({ width: 64 });
  });
});
