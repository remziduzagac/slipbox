import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "slipbox-html-cli-"));
const main = join(import.meta.dir, "../src/main.ts");
const raw = "<DIV align = 'right'><b>__original__ &amp; HTML</b></DIV>";
const source =
  "# HTML CLI\n\n" +
  raw +
  "\n\n<details><summary>More</summary><p>Body for printed output</p></details>\n\n<script>omitThis()</script>\n";
mkdirSync(join(root, ".slipbox"));
writeFileSync(join(root, "note.md"), source);
const env: Record<string, string | undefined> = { ...process.env, SLIPBOX_CONFIG: "", SLIPBOX_CLIPBOARD: "file" };
for (const kind of ["STATE", "CACHE", "CONFIG", "DATA"]) env["XDG_" + kind + "_HOME"] = join(root, kind);
afterAll(() => rmSync(root, { recursive: true, force: true }));
function run(args: string[]) {
  return Bun.spawnSync(["bun", main, ...args], { cwd: root, env, stdout: "pipe", stderr: "pipe", timeout: 30_000 });
}
describe("HTML on the CLI", () => {
  test("plain and ANSI render share semantic content and print every disclosure body", () => {
    for (const flags of [["--plain"], ["--color", "always"]]) {
      const result = run(["render", "note.md", "--width", "60", ...flags]);
      expect(new TextDecoder().decode(result.stderr)).toBe("");
      expect(result.exitCode).toBe(0);
      const out = new TextDecoder().decode(result.stdout);
      expect(out).toContain("Body for printed output");
      expect(out).toContain("__original__ & HTML");
      expect(out).not.toContain("omitThis");
      expect(out).not.toContain("<DIV");
      expect(out.includes("\x1b[")).toBe(flags[0] !== "--plain");
    }
  });

  test("the export worker preserves original HTML in Markdown", () => {
    const target = join(root, "result.export.md");
    const result = run(["export", "note.md", "--to", "md", "--out", target]);
    expect(result.exitCode).toBe(0);
    const out = readFileSync(target, "utf8");
    expect(out).toContain(raw);
    expect(out).toContain("<details><summary>More</summary><p>Body for printed output</p></details>");
    expect(out).not.toContain("omitThis");
  });
});
