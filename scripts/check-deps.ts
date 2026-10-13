#!/usr/bin/env bun
// The supply chain's gates (plan 14.10), run by `bun run check`:
//
//   - every dependency in package.json at an exact version — bun.lock pins the rest;
//   - bunfig.toml's install gates on: no install scripts, a version taken only once it's a week old, `bun add` exact;
//   - every package the binary bundles under a licence slipbox takes: a permissive one, or a weak copyleft one
//     accepted by name (`14.6`) — a new one fails here until it's been asked about;
//   - the CI's actions pinned by commit, not by a tag that can be moved; each workflow starting from no permission
//     (`permissions: {}`, each job granting its own) and giving every job a timeout (GR-D9).
//
// `--notices <file>` writes, from the same walk, the third-party notices a release ships beside the binary (`14.2`):
// each package's own licence files, the texts of those that ship none, what's compiled into packages (Hunspell,
// libwebp), and Bun's own — the runtime is in the binary too. `--sbom <file>` writes, from it too, the SBOM a release
// ships beside each pack (CycloneDX JSON, attested with the pack): the packages, their licences, sources and
// dependencies, what's compiled into them, and Bun.

import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

/** Licences taken for any package: permissive ones. */
const PERMISSIVE = new Set([
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

/** Packages taken by name under a licence that isn't in `PERMISSIVE`: each was asked about (plan 14.6). */
export const NAMED: Record<string, { licence: string; why: string }> = {
  elkjs: { licence: "EPL-2.0", why: "weak copyleft, accepted for use 2026-10-09 (beautiful-mermaid's layout)" },
  "@resvg/resvg-wasm": { licence: "MPL-2.0", why: "weak copyleft, accepted for use 2026-10-09 (SVG drawn, 12.15)" },
  "dictionary-en": { licence: "(MIT AND BSD)", why: "SCOWL's word lists under their own permissive terms (25.6)" },
};

/** Packages whose package.json names no licence: what their own LICENSE file says. */
const DECLARED: Record<string, string> = { "png-js": "MIT", typeahead: "Apache-2.0" };

/** Code compiled into a package's WebAssembly, not a package of its own: its notice is owed too. */
const EMBEDDED: { name: string; inside: string; licence: string; copyright: string; source: string; note?: string }[] =
  [
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
  ];

export interface Package {
  name: string;
  version: string;
  /** Its licence as an SPDX expression (a legacy `licenses` array joined by OR); "" when it names none. */
  licence: string;
  dir: string;
  repository: string;
  author: string;
  /** The packages it depends on, as the walk found them installed: `name@version` each. */
  dependsOn?: string[];
}

/** A package's folder as Node finds it from `from`: its own node_modules, then each parent's, up to the root's. */
function resolveDir(name: string, from: string, root: string): string | null {
  let dir = from;
  for (;;) {
    const p = join(dir, "node_modules", name);
    if (existsSync(join(p, "package.json"))) return realpathSync(p);
    if (dir === root || dirname(dir) === dir) return null;
    dir = dirname(dir);
  }
}

function licenceOf(pkg: Record<string, unknown>): string {
  const l = pkg.license ?? pkg.licenses;
  if (typeof l === "string") return l;
  if (Array.isArray(l))
    return l
      .map((x) => (x as { type?: string }).type ?? "")
      .filter(Boolean)
      .join(" OR ");
  if (l && typeof l === "object") return (l as { type?: string }).type ?? "";
  return DECLARED[pkg.name as string] ?? "";
}

/** A package.json's repository as a link: `git@host:a/b.git`, `git://`, `git+https://`, `github:a/b`, `a/b`. */
export function repoLink(repo: string): string {
  const r = repo.trim();
  if (!r) return "";
  const short = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(r);
  if (short) return `https://github.com/${short[1]!.replace(/\.git$/, "")}`;
  return r
    .replace(/^git\+/, "")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/^(?:git|ssh):\/\/(?:git@)?/, "https://")
    .replace(/\.git$/, "");
}

function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object")
    return ((v as { url?: string; name?: string }).url ?? (v as { name?: string }).name ?? "") as string;
  return "";
}

/** Every package the binary can bundle: package.json's dependencies and theirs, optional ones where installed.
 *  `direct`: those package.json names itself, as `name@version`. */
export function productionPackages(root = ROOT): { packages: Package[]; missing: string[]; direct: string[] } {
  const seen = new Map<string, Package>();
  const missing: string[] = [];
  const visit = (dir: string): string => {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Record<string, unknown>;
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) return key;
    const dependsOn: string[] = [];
    seen.set(key, {
      name: pkg.name as string,
      version: pkg.version as string,
      licence: licenceOf(pkg),
      dir,
      repository: repoLink(text(pkg.repository)),
      author: text(pkg.author),
      dependsOn,
    });
    const deps = Object.keys((pkg.dependencies ?? {}) as object).map((d) => [d, false] as const);
    const optional = Object.keys((pkg.optionalDependencies ?? {}) as object).map((d) => [d, true] as const);
    for (const [dep, opt] of [...deps, ...optional]) {
      const d = resolveDir(dep, dir, root);
      if (d) dependsOn.push(visit(d));
      else if (!opt) missing.push(`${dep} (needed by ${key})`);
    }
    return key;
  };
  const top = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  const direct: string[] = [];
  for (const dep of Object.keys(top.dependencies ?? {})) {
    const d = resolveDir(dep, root, root);
    if (d) direct.push(visit(d));
    else missing.push(`${dep} (package.json's)`);
  }
  return {
    packages: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)),
    missing,
    direct,
  };
}

/** Whether an SPDX expression is taken: an OR by either side, an AND by both; `X WITH exception` as X. */
export function licenceTaken(expr: string, taken: (id: string) => boolean = (id) => PERMISSIVE.has(id)): boolean {
  const tokens = expr.match(/\(|\)|[^\s()]+/g) ?? [];
  let i = 0;
  const or = (): boolean => {
    let v = and();
    while (tokens[i] === "OR") {
      i++;
      v = and() || v;
    }
    return v;
  };
  const and = (): boolean => {
    let v = atom();
    while (tokens[i] === "AND") {
      i++;
      v = atom() && v;
    }
    return v;
  };
  const atom = (): boolean => {
    const t = tokens[i++];
    if (t === "(") {
      const v = or();
      if (tokens[i++] !== ")") throw new Error(`unbalanced: ${expr}`);
      return v;
    }
    if (!t || t === ")" || t === "AND" || t === "OR") throw new Error(`not a licence expression: ${expr}`);
    if (tokens[i] === "WITH") i += 2;
    return taken(t);
  };
  try {
    const v = or();
    return i === tokens.length && v;
  } catch {
    return false;
  }
}

/** The licence problems among packages: one named by none, or by one slipbox doesn't take. */
export function licenceProblems(packages: Package[]): string[] {
  const out: string[] = [];
  for (const p of packages) {
    const named = NAMED[p.name];
    if (named && p.licence === named.licence) continue;
    if (!p.licence) out.push(`${p.name}@${p.version}: names no licence`);
    else if (!licenceTaken(p.licence))
      out.push(`${p.name}@${p.version}: ${p.licence} — not a licence slipbox takes (plan 14.6, 14.10)`);
  }
  return out;
}

/** Dependencies in package.json not at an exact version. */
export function specProblems(pkg: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): string[] {
  const out: string[] = [];
  for (const [section, deps] of Object.entries({
    dependencies: pkg.dependencies ?? {},
    devDependencies: pkg.devDependencies ?? {},
  })) {
    for (const [name, spec] of Object.entries(deps))
      if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(spec))
        out.push(`${section}: ${name} is "${spec}", not an exact version`);
  }
  return out;
}

/** bunfig.toml's `[install]` gates, where one is off. */
export function bunfigProblems(toml: string): string[] {
  const install = /^\[install\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(toml)?.[1] ?? "";
  const value = (key: string) => new RegExp(`^${key}\\s*=\\s*(\\S+)`, "m").exec(install)?.[1];
  const out: string[] = [];
  if (value("ignoreScripts") !== "true")
    out.push("bunfig.toml: [install] ignoreScripts = true, so no install script runs");
  if (!(Number(value("minimumReleaseAge")) >= 604800))
    out.push("bunfig.toml: [install] minimumReleaseAge = 604800 or more, a week");
  if (value("exact") !== "true") out.push("bunfig.toml: [install] exact = true, so `bun add` pins");
  return out;
}

/** A workflow's actions not pinned by a full commit hash (a local `./` one is the repository's own). */
export function workflowProblems(name: string, yaml: string): string[] {
  const out: string[] = [];
  for (const m of yaml.matchAll(/^\s*(?:-\s*)?uses:\s*["']?([^\s"'#]+)/gm)) {
    const ref = m[1]!;
    if (ref.startsWith("./")) continue;
    if (!/@[0-9a-f]{40}$/.test(ref))
      out.push(`${name}: ${ref} — pin it by its commit's full hash (a tag can be moved)`);
  }
  return out;
}

/** A workflow's shape, where it's off (GR-D9): no permission by default — `permissions: {}` at the top, each job
 *  granting its own — and a timeout on every job (one that calls a reusable workflow can't have one). */
export function workflowShapeProblems(name: string, yaml: string): string[] {
  let doc: { permissions?: unknown; jobs?: Record<string, Record<string, unknown>> };
  try {
    doc = Bun.YAML.parse(yaml) as typeof doc;
  } catch (err) {
    return [`${name}: not YAML that parses — ${(err as Error).message}`];
  }
  const out: string[] = [];
  const p = doc?.permissions;
  if (!(p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).length === 0))
    out.push(`${name}: \`permissions: {}\` at the top, so a job has only what it grants itself`);
  for (const [id, job] of Object.entries(doc?.jobs ?? {}))
    if (job && !("uses" in job) && !("timeout-minutes" in job)) out.push(`${name}: job ${id} has no timeout-minutes`);
  return out;
}

function workflows(root: string): { name: string; text: string }[] {
  const dir = join(root, ".github", "workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => ({ name: `.github/workflows/${f}`, text: readFileSync(join(dir, f), "utf8") }));
}

/** Every gate's problems, for the root; and the walk's packages, slipbox's own dependencies among them `direct`. */
/** The docs' site (site/), a project of its own whose packages only build the site, never ship: its versions exact and
 *  its install gated as the root's are. */
export function siteProblems(root = ROOT): string[] {
  const dir = join(root, "site");
  if (!existsSync(join(dir, "package.json"))) return [];
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const bunfig = existsSync(join(dir, "bunfig.toml")) ? readFileSync(join(dir, "bunfig.toml"), "utf8") : "";
  return [
    ...specProblems(pkg).map((p) => `site/package.json: ${p}`),
    ...bunfigProblems(bunfig).map((p) => `site/${p}`),
  ];
}

export function checkDeps(root = ROOT): { problems: string[]; packages: Package[]; direct: string[] } {
  const { packages, missing, direct } = productionPackages(root);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const problems = [
    ...missing.map((m) => `not installed: ${m} — run bun install`),
    ...specProblems(pkg),
    ...bunfigProblems(readFileSync(join(root, "bunfig.toml"), "utf8")),
    ...siteProblems(root),
    ...licenceProblems(packages),
    ...workflows(root).flatMap((w) => [...workflowProblems(w.name, w.text), ...workflowShapeProblems(w.name, w.text)]),
  ];
  return { problems, packages, direct };
}

const RULE = "=".repeat(100);
const LICENCE_FILE = /^(licen[cs]e|copying|notice|copyright)([.-].*)?$/i;

/** A licence's standard text (notices/licenses), its copyright filled in where it has a blank for one. */
function standardText(root: string, id: string, holder: string): string | null {
  const f = join(root, "notices", "licenses", `${id}.txt`);
  if (!existsSync(f)) return null;
  return readFileSync(f, "utf8").replace(/<year> <copyright holders>|<year> <owner>/, holder || "the authors");
}

/** The licence ids an expression's taken side names: an OR's first taken alternative, an AND's all. */
function idsOf(expr: string): string[] {
  const alternatives = expr.replace(/[()]/g, " ").split(/\s+OR\s+/);
  const pick = alternatives.find((a) => licenceTaken(a)) ?? alternatives[0] ?? "";
  return pick
    .split(/\s+AND\s+/)
    .map((s) => s.trim().split(/\s+WITH\s+/)[0]!)
    .filter(Boolean);
}

/** The third-party notices a release ships beside the binary. */
export function notices(packages: Package[], version: string, root = ROOT): string {
  const parts: string[] = [
    `slipbox ${version}: the third-party software in this program, and the notices their licences ask for.\n`,
    "Each part below is a package bundled into the binary, code compiled into one, or the runtime (Bun). Where a",
    "licence asks for its source to be available (MPL, EPL, LGPL), where it is is given with it.\n",
  ];
  const section = (title: string, body: string) => parts.push(`${RULE}\n${title}\n${RULE}\n\n${body.trimEnd()}\n`);
  for (const p of packages) {
    const files = readdirSync(p.dir)
      .filter((f) => LICENCE_FILE.test(f))
      .sort();
    const body = files.length
      ? files.map((f) => readFileSync(join(p.dir, f), "utf8").trimEnd()).join("\n\n")
      : idsOf(p.licence)
          .map((id) => standardText(root, id, p.author) ?? `${id}: see https://spdx.org/licenses/${id}.html`)
          .join("\n\n");
    const named = NAMED[p.name];
    const source =
      named || /MPL|EPL|LGPL/.test(p.licence)
        ? `Its source: ${p.repository || `https://www.npmjs.com/package/${p.name}`}\n\n`
        : "";
    section(`${p.name} ${p.version} — ${p.licence}${p.repository ? `\n${p.repository}` : ""}`, `${source}${body}`);
  }
  for (const e of EMBEDDED) {
    const body = `${e.note ? `${e.note}\n` : ""}Its source: ${e.source}\n\n${standardText(root, e.licence, "the copyright holders above") ?? e.licence}`;
    section(`${e.name}, compiled into ${e.inside} — ${e.licence}`, `${e.copyright}\n\n${body}`);
  }
  const bun = join(root, "node_modules", "bun-types", "docs", "project", "license.mdx");
  const bunText = existsSync(bun)
    ? readFileSync(bun, "utf8").replace(/^---[\s\S]*?---\s*/, "")
    : "Bun is MIT-licensed: https://bun.com/docs/project/license";
  const lgpl = standardText(root, "LGPL-2.1-only", "") ?? "";
  section(
    `Bun ${Bun.version}, the runtime the binary is built on — MIT, with the libraries it links`,
    `${bunText}\n\n${RULE}\nThe GNU Lesser General Public License, version 2.1 (JavaScriptCore, WebKit, tinycc, above)\n${RULE}\n\n${lgpl}`,
  );
  return `${parts.join("\n")}\n`;
}

/** An npm package's Package URL: `pkg:npm/%40scope/name@version`. */
export function purl(name: string, version: string): string {
  const slash = name.startsWith("@") ? name.indexOf("/") : -1;
  const scope = slash > 0 ? `${encodeURIComponent(name.slice(0, slash))}/` : "";
  return `pkg:npm/${scope}${encodeURIComponent(name.slice(slash + 1))}@${encodeURIComponent(version)}`;
}

type CdxLicence = { license: { id: string } } | { expression: string };

export interface CdxComponent {
  type: "application" | "library" | "platform";
  "bom-ref": string;
  group?: string;
  name: string;
  version?: string;
  description?: string;
  purl?: string;
  licenses?: CdxLicence[];
  copyright?: string;
  externalReferences?: { type: "vcs" | "website"; url: string }[];
  properties?: { name: string; value: string }[];
}

/** A CycloneDX 1.6 SBOM, as `sbom` writes it. */
export interface Sbom {
  bomFormat: "CycloneDX";
  specVersion: "1.6";
  serialNumber: string;
  version: 1;
  metadata: {
    timestamp: string;
    tools: { components: { type: "application"; name: string; description: string }[] };
    component: CdxComponent;
  };
  components: CdxComponent[];
  dependencies: { ref: string; dependsOn: string[] }[];
}

/** A licence as CycloneDX has it: an SPDX id alone, or the expression. Only licences the gate took reach a release,
 *  and each single one of those is an SPDX id. */
function cdxLicences(expr: string): CdxLicence[] {
  if (!expr) return [];
  return /^[\w.+-]+$/.test(expr) ? [{ license: { id: expr } }] : [{ expression: expr }];
}

/** The SBOM a release ships beside a pack (CycloneDX 1.6, JSON): what its binary bundles, from the same walk as its
 *  notices — each package with its licence, its source and the packages it depends on — and the code compiled into
 *  packages, and Bun, the runtime. slipbox's Package URL names the release's tag: `v<version>`, or a preview's
 *  (`tag`). `serial` and `timestamp` are this one's, new each time unless given. */
export function sbom(
  walk: { packages: Package[]; direct: string[] },
  release: { version: string; target?: string; repo?: string; tag?: string },
  root = ROOT,
  at: { serial?: string; timestamp?: string } = {},
): Sbom {
  const own = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    license?: string;
    description?: string;
  };
  const refOf = new Map(walk.packages.map((p) => [`${p.name}@${p.version}`, purl(p.name, p.version)]));
  const slipbox: CdxComponent = {
    type: "application",
    "bom-ref": "slipbox",
    name: "slipbox",
    version: release.version,
    ...(own.description ? { description: own.description } : {}),
    ...(release.repo ? { purl: `pkg:github/${release.repo}@${release.tag ?? `v${release.version}`}` } : {}),
    licenses: cdxLicences(own.license ?? ""),
    ...(release.repo ? { externalReferences: [{ type: "vcs", url: `https://github.com/${release.repo}` }] } : {}),
    ...(release.target ? { properties: [{ name: "slipbox:target", value: release.target }] } : {}),
  };
  const packages: CdxComponent[] = walk.packages.map((p) => {
    const slash = p.name.startsWith("@") ? p.name.indexOf("/") : -1;
    return {
      type: "library",
      "bom-ref": purl(p.name, p.version),
      ...(slash > 0 ? { group: p.name.slice(0, slash) } : {}),
      name: p.name.slice(slash + 1),
      version: p.version,
      purl: purl(p.name, p.version),
      licenses: cdxLicences(p.licence),
      ...(p.repository ? { externalReferences: [{ type: "vcs", url: p.repository }] } : {}),
    };
  });
  const embedded: CdxComponent[] = EMBEDDED.filter((e) => walk.packages.some((p) => p.name === e.inside)).map((e) => ({
    type: "library",
    "bom-ref": `embedded:${e.name}`,
    name: e.name,
    description: `compiled into ${e.inside}'s WebAssembly`,
    licenses: cdxLicences(e.licence),
    copyright: e.copyright,
    externalReferences: [{ type: "vcs", url: e.source }],
  }));
  const bun: CdxComponent = {
    type: "platform",
    "bom-ref": `pkg:github/oven-sh/bun@bun-v${Bun.version}`,
    name: "bun",
    version: Bun.version,
    description:
      "The runtime the binary is built on: MIT, with the libraries it links statically (JavaScriptCore and WebKit " +
      "under the LGPL, and others), whose notices are in NOTICES.txt.",
    purl: `pkg:github/oven-sh/bun@bun-v${Bun.version}`,
    licenses: cdxLicences("MIT"),
    externalReferences: [{ type: "website", url: "https://bun.com" }],
  };
  const inside = (p: Package) => EMBEDDED.filter((e) => e.inside === p.name).map((e) => `embedded:${e.name}`);
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: at.serial ?? `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: at.timestamp ?? new Date().toISOString(),
      tools: {
        components: [
          { type: "application", name: "check-deps", description: "slipbox's scripts/check-deps.ts: its walk" },
        ],
      },
      component: slipbox,
    },
    components: [...packages, ...embedded, bun],
    dependencies: [
      { ref: "slipbox", dependsOn: [...walk.direct.flatMap((k) => refOf.get(k) ?? []), bun["bom-ref"]] },
      ...walk.packages.map((p) => ({
        ref: purl(p.name, p.version),
        dependsOn: [...new Set([...(p.dependsOn ?? []).flatMap((k) => refOf.get(k) ?? []), ...inside(p)])],
      })),
      ...embedded.map((e) => ({ ref: e["bom-ref"], dependsOn: [] })),
      { ref: bun["bom-ref"], dependsOn: [] },
    ],
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const { problems, packages, direct } = checkDeps();
  if (problems.length) {
    process.stderr.write(
      `check-deps: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n${problems.map((p) => `  ${p}`).join("\n")}\n`,
    );
    process.exit(1);
  }
  const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
  const write: Record<string, () => string> = {
    "--notices": () => notices(packages, version),
    "--sbom": () => `${JSON.stringify(sbom({ packages, direct }, { version }), null, 2)}\n`,
  };
  for (const [flag, make] of Object.entries(write)) {
    const at = args.indexOf(flag);
    if (at < 0) continue;
    const out = args[at + 1];
    if (!out) {
      process.stderr.write(`check-deps: ${flag} needs a file\n`);
      process.exit(2);
    }
    writeFileSync(out, make());
  }
  process.stdout.write(
    `check-deps: ${packages.length} packages, each under a licence taken; versions exact; install gates on; ` +
      "actions pinned; workflows start from no permission, every job timed\n",
  );
}
