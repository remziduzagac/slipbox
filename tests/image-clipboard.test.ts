import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyImage } from "../src/core/clipboard.ts";

const dir = mkdtempSync(join(tmpdir(), "slipbox-image-copy-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("image clipboard sends bytes and an explicit MIME type to an optional helper", async () => {
  const keys = ["PATH", "WAYLAND_DISPLAY", "DISPLAY", "SLIPBOX_CLIPBOARD"];
  const previous = keys.map((key) => process.env[key]);
  const path = join(dir, "image.png");
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  writeFileSync(path, bytes);
  writeFileSync(
    join(dir, "wl-copy"),
    `#!/bin/sh
printf '%s\\n' "$@" > "\${0%/*}/args"
/bin/cat > "\${0%/*}/bytes"
`,
    { mode: 0o755 },
  );
  Object.assign(process.env, {
    PATH: dir,
    WAYLAND_DISPLAY: "test",
    DISPLAY: "",
  });
  delete process.env.SLIPBOX_CLIPBOARD;
  try {
    expect(await copyImage(path)).toBe("wl-copy");
    expect(readFileSync(join(dir, "args"), "utf8")).toBe("--type\nimage/png\n");
    expect(readFileSync(join(dir, "bytes"))).toEqual(bytes);
    const cached = join(dir, "hashed-cache-name");
    writeFileSync(cached, bytes);
    expect(await copyImage(cached)).toBe("wl-copy");
    process.env.PATH = join(dir, "missing");
    expect(await copyImage(path)).toBeNull();
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
});
