// What slipbox takes, by licence, and what's compiled into the packages it bundles (plan 14.6, 14.10; D192): read
// by `check-deps.ts`' gates and notices, and by `release.ts`, whose releases carry the sources these licences ask for.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Package } from "./check-deps.ts";

/** Licences taken for any package: permissive ones. */
export const PERMISSIVE = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "Zlib",
  "CC0-1.0",
  "Unlicense",
]);

/** OpenTUI's native library, a package for each platform slipbox is built for: MIT, and since 0.8.1 FFmpeg in it. */
const OPENTUI_NATIVE = {
  licence: "MIT AND LGPL-2.1-or-later",
  why: "weak copyleft, accepted for use 2026-11-22: FFmpeg linked in, its source with each release (D277)",
};

/** Packages taken by name under a licence that isn't in `PERMISSIVE`: each was asked about (plan 14.6). */
export const NAMED: Record<string, { licence: string; why: string }> = {
  elkjs: { licence: "EPL-2.0", why: "weak copyleft, accepted for use 2026-10-09 (beautiful-mermaid's layout)" },
  "@resvg/resvg-wasm": { licence: "MPL-2.0", why: "weak copyleft, accepted for use 2026-10-09 (SVG drawn, 12.15)" },
  "dictionary-en": { licence: "(MIT AND BSD)", why: "SCOWL's word lists under their own permissive terms (25.6)" },
  "@opentui/core-darwin-arm64": OPENTUI_NATIVE,
  "@opentui/core-linux-x64": OPENTUI_NATIVE,
  "@opentui/core-linux-arm64": OPENTUI_NATIVE,
  "@opentui/core-linux-x64-musl": OPENTUI_NATIVE,
  "@opentui/core-linux-arm64-musl": OPENTUI_NATIVE,
};

/** Packages whose package.json names no licence: what their own LICENSE file says. */
export const DECLARED: Record<string, string> = { "png-js": "MIT", typeahead: "Apache-2.0" };

/** Code compiled into a package's WebAssembly or native library, not a package of its own: its notice is owed too.
 *  `within`, the packages it's in, when `inside` names more than one. `archive`: the source a release carries beside its
 *  binaries (`source`, by its SHA-256), as the licence asks; `declared`, the file in each package it's in that names
 *  the same version, address and SHA-256 — `embeddedProblems` holds them together, so an upgrade that changes it says
 *  so. */
export interface Embedded {
  name: string;
  version?: string;
  inside: string;
  within?: RegExp;
  licence: string;
  copyright: string;
  source: string;
  archive?: { sha256: string; declared: string };
  note?: string;
}
export const EMBEDDED: Embedded[] = [
  {
    name: "Hunspell",
    inside: "hunspell-asm",
    licence: "MPL-1.1",
    copyright: "Copyright (C) 2002-2022 Németh László",
    source: "https://github.com/hunspell/hunspell",
    note: "Hunspell is offered under MPL-1.1, GPL-2.0 or LGPL-2.1; slipbox takes it under MPL-1.1 (plan 14.6).",
  },
  {
    name: "libwebp",
    inside: "@jsquash/webp",
    licence: "BSD-3-Clause",
    copyright: "Copyright (c) 2010, Google Inc. All rights reserved.",
    source: "https://chromium.googlesource.com/webm/libwebp",
  },
  {
    name: "FFmpeg",
    version: "9.0.2",
    inside: "OpenTUI's native library (@opentui/core-<platform>)",
    within: /^@opentui\/core-(darwin|linux|win32)-/,
    licence: "LGPL-2.1-or-later",
    copyright: "Copyright (c) 2000-2026 the FFmpeg developers",
    source: "https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz",
    archive: {
      sha256: "8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e",
      declared: "FFMPEG-SOURCE.md",
    },
    note:
      "A decode-only build (MP4, H.264, AAC: OpenTUI's video, which slipbox doesn't play), linked statically into\n" +
      "OpenTUI's native library, unmodified. OpenTUI's source (https://github.com/anomalyco/opentui, with\n" +
      "packages/native/scripts/build-ffmpeg.ts) builds that library again with an FFmpeg you've changed, and slipbox\n" +
      "loads the one OPENTUI_LIB_PATH names in place of its own.",
  },
];

/** The source archives a release carries beside its binaries: each one's file name, address and SHA-256. */
export function sourceArchives(): { name: string; url: string; sha256: string; of: string }[] {
  return EMBEDDED.flatMap((e) =>
    e.archive
      ? [{ name: e.source.slice(e.source.lastIndexOf("/") + 1), url: e.source, sha256: e.archive.sha256, of: e.name }]
      : [],
  );
}

/** Whether `e` is compiled into the package named `name`. */
export const holds = (e: Embedded, name: string) => (e.within ? e.within.test(name) : e.inside === name);

/** Where what's compiled in and what its packages declare part: each package it's in names it, in its `declared` file,
 *  at the version, address and SHA-256 recorded here. */
export function embeddedProblems(packages: Package[], embedded: Embedded[] = EMBEDDED): string[] {
  const out: string[] = [];
  for (const e of embedded.filter((x) => x.archive))
    for (const p of packages.filter((x) => holds(e, x.name))) {
      const file = join(p.dir, e.archive!.declared);
      const recorded = `${e.name} ${e.version} (${e.source}, SHA-256 ${e.archive!.sha256})`;
      if (!existsSync(file)) {
        out.push(`${p.name}@${p.version}: no ${e.archive!.declared} to say it holds ${recorded}: update EMBEDDED`);
        continue;
      }
      const text = readFileSync(file, "utf8");
      const version = new RegExp(`${e.name} (\\d+(?:\\.\\d+)+)`).exec(text)?.[1];
      const url = /^- Source: (\S+)$/m.exec(text)?.[1];
      const sha = /^- SHA-256: `([0-9a-f]{64})`$/m.exec(text)?.[1];
      if (version !== e.version || url !== e.source || sha !== e.archive!.sha256)
        out.push(
          `${p.name}@${p.version}: its ${e.archive!.declared} names ${e.name} ${version ?? "?"} (${url ?? "?"}, ` +
            `SHA-256 ${sha ?? "?"}), and EMBEDDED ${recorded}: update EMBEDDED`,
        );
    }
  return out;
}
