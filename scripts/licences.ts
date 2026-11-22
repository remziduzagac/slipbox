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

/** OpenTUI's native library: a package for each platform, MIT, and since 0.8.1 FFmpeg and zlib in it. The one list
 *  of what carries them: `named` takes these packages by it, `EMBEDDED` finds FFmpeg and zlib in them by it. */
const OPENTUI_LIBRARY = "OpenTUI's native library (@opentui/core-<platform>)";
const OPENTUI_PACKAGES = /^@opentui\/core-(darwin|linux|win32)-/;

/** A package taken under a licence that isn't in `PERMISSIVE`, and why: each was asked about (plan 14.6). */
interface Taken {
  licence: string;
  why: string;
}

/** Packages taken by name under a licence that isn't in `PERMISSIVE`. */
const NAMED: Record<string, Taken> = {
  elkjs: { licence: "EPL-2.0", why: "weak copyleft, accepted for use 2026-10-09 (beautiful-mermaid's layout)" },
  "@resvg/resvg-wasm": { licence: "MPL-2.0", why: "weak copyleft, accepted for use 2026-10-09 (SVG drawn, 12.15)" },
  "dictionary-en": { licence: "(MIT AND BSD)", why: "SCOWL's word lists under their own permissive terms (25.6)" },
};
/** And by a pattern of names: OpenTUI's native packages, whatever the platform. */
const NAMED_BY_PATTERN: (Taken & { names: RegExp })[] = [
  {
    names: OPENTUI_PACKAGES,
    licence: "MIT AND LGPL-2.1-or-later",
    why: "weak copyleft, accepted for use 2026-11-22: FFmpeg linked in, its source with each release (D277)",
  },
];

/** How the package named `name` is taken by name, if it is. */
export const named = (name: string): Taken | undefined =>
  NAMED[name] ?? NAMED_BY_PATTERN.find((n) => n.names.test(name));

/** Packages whose package.json names no licence: what their own LICENSE file says. */
export const DECLARED: Record<string, string> = { "png-js": "MIT", typeahead: "Apache-2.0" };

/** Code compiled into a package's WebAssembly or native library, not a package of its own: its notice is owed too.
 *  `within`, the packages it's in, when `inside` names more than one. `licenceFile`, its licence's text as those
 *  packages ship it, in place of the standard text. `archive`: its source's archive (`source`), by its SHA-256;
 *  `declared`, how the packages it's in name the same version, address and SHA-256 — a file of theirs, and its lines
 *  for the address and the hash — which `embeddedProblems` holds to this, so an upgrade that changes it says so;
 *  `carried`, whether each release carries the archive beside its binaries, as the licence asks. */
export interface Embedded {
  name: string;
  version?: string;
  inside: string;
  within?: RegExp;
  licence: string;
  licenceFile?: string;
  copyright: string;
  source: string;
  archive?: { sha256: string; declared: { file: string; source: RegExp; sha256: RegExp }; carried: boolean };
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
    inside: OPENTUI_LIBRARY,
    within: OPENTUI_PACKAGES,
    licence: "LGPL-2.1-or-later",
    copyright: "Copyright (c) 2000-2026 the FFmpeg developers",
    source: "https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz",
    archive: {
      sha256: "8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e",
      declared: { file: "FFMPEG-SOURCE.md", source: /^- Source: (\S+)$/m, sha256: /^- SHA-256: `([0-9a-f]{64})`$/m },
      carried: true,
    },
    note:
      "A decode-only build (MP4, H.264, AAC: OpenTUI's video, which slipbox doesn't play), linked statically into\n" +
      "OpenTUI's native library, unmodified. OpenTUI's source (https://github.com/anomalyco/opentui, with\n" +
      "packages/native/scripts/build-ffmpeg.ts) builds that library again with an FFmpeg you've changed, and slipbox\n" +
      "loads the one OPENTUI_LIB_PATH names in place of its own.",
  },
  {
    name: "zlib",
    version: "1.3.2",
    inside: OPENTUI_LIBRARY,
    within: OPENTUI_PACKAGES,
    licence: "Zlib",
    licenceFile: "LICENSE-ZLIB",
    copyright: "(C) 1995-2026 Jean-loup Gailly and Mark Adler",
    source: "https://zlib.net/fossils/zlib-1.3.2.tar.gz",
    archive: {
      sha256: "bb329a0a2cd0274d05519d61c667c062e06990d72e125ee2dfa8de64f0119d16",
      declared: {
        file: "FFMPEG-SOURCE.md",
        source: /^- zlib \d+(?:\.\d+)+: (\S+)$/m,
        sha256: /^- zlib SHA-256: `([0-9a-f]{64})`$/m,
      },
      carried: false,
    },
    note: "Linked into OpenTUI's native library with FFmpeg, which uses it.",
  },
];

/** A source archive a release carries beside its binaries: its file name, address and SHA-256, and what it's the
 *  source of. */
export interface SourceArchive {
  name: string;
  url: string;
  sha256: string;
  of: string;
}

/** The source archives a release carries beside its binaries. */
export function sourceArchives(): SourceArchive[] {
  return EMBEDDED.flatMap((e) =>
    e.archive?.carried
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
  for (const e of embedded)
    for (const p of e.archive ? packages.filter((x) => holds(e, x.name)) : []) {
      const { declared, sha256 } = e.archive!;
      const file = join(p.dir, declared.file);
      const recorded = `${e.name} ${e.version} (${e.source}, SHA-256 ${sha256})`;
      if (!existsSync(file)) {
        out.push(`${p.name}@${p.version}: no ${declared.file} to say it holds ${recorded}: update EMBEDDED`);
        continue;
      }
      const text = readFileSync(file, "utf8");
      const version = new RegExp(`${e.name} (\\d+(?:\\.\\d+)+)`).exec(text)?.[1];
      const url = declared.source.exec(text)?.[1];
      const sha = declared.sha256.exec(text)?.[1];
      if (version !== e.version || url !== e.source || sha !== sha256)
        out.push(
          `${p.name}@${p.version}: its ${declared.file} names ${e.name} ${version ?? "?"} (${url ?? "?"}, ` +
            `SHA-256 ${sha ?? "?"}), and EMBEDDED ${recorded}: update EMBEDDED`,
        );
    }
  return out;
}
