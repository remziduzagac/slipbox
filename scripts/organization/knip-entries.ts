// Discovery roots for Knip: process/build entries and externally loaded test/site code.
import { readFileSync } from "node:fs";
import { join } from "node:path";

type BuildPackage = { scripts?: { build?: unknown } };

export function knipWorkspaces(root: string) {
  const build = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as BuildPackage).scripts?.build;
  if (typeof build !== "string") throw new Error("Knip discovery needs package.json scripts.build");
  // The build and release harness both use whitespace-delimited entry arguments.
  const compiled = build.split(/\s+/).filter((arg) => arg.startsWith("src/") && /\.tsx?$/.test(arg));
  if (!compiled.length) throw new Error("Knip discovery found no TypeScript build entries");
  return {
    ".": {
      entry: [
        ...new Set(compiled),
        "knip.config.ts",
        "scripts/*.ts",
        "tests/**/*.test.{ts,tsx}",
        "tests/setup.ts",
        "tests/fixtures/**/*.ts",
        "tests/terminal/{run,shots,worker,export-hold,index-hold,spell-hold,made-up-checks}.ts",
        "tests/terminal/herdr/run.ts",
        "tests/terminal/shots/*.ts",
        // T36 retains this compatible drawing facade independently of its internal callers.
        "src/tui/shell/overlays/draw-overlays.ts",
      ],
      project: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "tests/**/*.{ts,tsx}", "knip.config.ts"],
    },
    site: {
      entry: ["astro.config.mjs", "src/content.config.ts", "src/route-data.ts", "src/pages/**/*.astro", "scripts/*.ts"],
      project: ["astro.config.mjs", "src/**/*.{ts,js,mjs,astro}", "scripts/**/*.{ts,js,mjs}"],
    },
  };
}
