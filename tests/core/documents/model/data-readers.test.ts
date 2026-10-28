import { expect, test } from "bun:test";
import { readToml } from "../../../../src/core/documents/model/data/readers/toml.ts";
import { readIni } from "../../../../src/core/documents/model/data/readers/ini.ts";
import { stripJsonComments } from "../../../../src/core/documents/model/data/readers/json.ts";
import { readYaml } from "../../../../src/core/documents/model/data/readers/yaml.ts";
import { readDelimited } from "../../../../src/core/documents/model/data/readers/delimited.ts";
import { dataLinks } from "../../../../src/core/documents/model/data/links.ts";
import { dataOutline } from "../../../../src/core/documents/model/data/outline.ts";

test("TOML duplicate-key validation stays distinct from INI line admission", () => {
  const text = "x=1\nx=2\n";
  expect(readToml(text).error).not.toBeNull();
  expect(readIni(text).error).toBeNull();
  expect(readIni(text).tree.children.filter((n) => (n.type as string) === "dataField")).toHaveLength(2);
});

test("JSON-comment blanking retains strings and block-comment offsets", () => {
  const source = '{"url":"https://example.invalid/a//b",/* note */"x":1,}';
  const clean = stripJsonComments(source);
  expect(clean.length).toBe(source.length);
  expect(JSON.parse(clean)).toEqual({ url: "https://example.invalid/a//b", x: 1 });
});

test("YAML document admission does not bypass the separate JSON validator", () => {
  expect(readYaml("x: 1\n", false).error).toBeNull();
  expect(readYaml("x: 1\n", true).error).not.toBeNull();
  expect(readYaml('{"x":1}', true).error).toBeNull();
});

test("delimited tables retain doubled quotes in a quoted cell", () => {
  const parsed = readDelimited('x,y\n"a""b",2\n', ",");
  expect(parsed.error).toBeNull();
  const table = parsed.tree.children.find((n) => n.type === "table");
  expect(table?.children[1]?.children[0]?.children[0]).toMatchObject({ type: "text", value: 'a"b' });
});

test("outline and reference queries retain source lines and explicit reference keys", () => {
  const parsed = readToml('[section]\npath = "a.md"\nother = "not-a-link"\n');
  expect(dataOutline(parsed.tree)[0]).toMatchObject({ text: "section", line: 1 });
  expect(dataLinks(parsed.tree)).toHaveLength(1);
});
