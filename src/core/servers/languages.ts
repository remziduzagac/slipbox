// Which language a file is, and which servers serve it (plan 19.2): built-in defaults in Helix's
// shape — a language's file types, its root markers and its servers, the main one first and add-ons
// after; a server's command, settings and, for those published on npm, the package slipbox installs
// privately (19.5). The user's config takes the same shape (`[language-server.x]`, `[[language]]`).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * What a server is used for, by Helix's names (`only-features`, `except-features`): several servers on
 * one file each do what they're for — the main one everything, a linter's its diagnostics and fixes.
 */
export type Feature = "diagnostics" | "hover" | "goto-definition" | "goto-type-definition" | "goto-implementation" | "goto-reference" | "document-symbols" | "workspace-symbols" | "completion" | "signature-help" | "rename-symbol" | "code-action" | "format";

/** An add-on's features unless the config says: a linter's. */
export const ADD_ON_FEATURES: Feature[] = ["diagnostics", "code-action", "format"];

/** A server slipbox can run. */
export interface ServerDef {
  name: string;
  /** Its program's name, as found on PATH or in a project (or a path). */
  command: string;
  args: string[];
  /** On npm: the package (pinned), the program inside it, and anything it needs beside it. Absent:
   *  a native server, found but never installed (the system is the user's). */
  npm?: { package: string; version: string; bin: string; with?: string[] };
  /** Its settings by default (nvim-lspconfig's where it has some): a server given none may check nothing. */
  config?: Record<string, unknown>;
  /** Sent with `initialize`. */
  initOptions?: unknown;
  environment?: Record<string, string>;
  /** An add-on (a linter's server): it runs only where the project has one of these — a file, or
   *  `file:text` for a file holding `text` (`pyproject.toml:[tool.ruff`). */
  requires?: string[];
  /** A main server used only where this holds of the project's top folder. */
  when?: (root: string) => boolean;
  /** A native server: how to get it, for `slipbox doctor`. */
  hint?: string;
  /** Found only in the project or slipbox's installs: its name elsewhere may be another program (an older `tsc`). */
  ownOnly?: boolean;
}

export interface LanguageDef {
  name: string;
  /** The protocol's id for its files. */
  languageId: string;
  /** Extensions, and whole names (`Dockerfile`), that are this language. */
  fileTypes: string[];
  /** What marks a project's top folder, nearest first. */
  roots: string[];
  /** Its servers by name: the first found is the main one; add-ons run beside it. */
  servers: string[];
  /** A server's features for this language, as the config limits them (Helix's `only-features`, `except-features`). */
  features?: Record<string, { only?: Feature[]; except?: Feature[] }>;
  /** Its linters without a server (19.19), by name: each runs where the project asks for it. */
  linters?: string[];
}

/** Whether a server does a feature for a language: as the language's config says, else a main server everything, an add-on a linter's. */
export function does(def: ServerDef, lang: LanguageDef, feature: Feature): boolean {
  const f = lang.features?.[def.name];
  if (f?.only) return f.only.includes(feature);
  if (f?.except) return !f.except.includes(feature);
  return !def.requires || ADD_ON_FEATURES.includes(feature);
}

const ESLINT_CONFIGS = [
  "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", "eslint.config.mts", "eslint.config.cts",
  ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yaml", ".eslintrc.yml", "package.json:\"eslintConfig\"",
];
const STYLELINT_CONFIGS = [".stylelintrc", ".stylelintrc.json", ".stylelintrc.yaml", ".stylelintrc.yml", ".stylelintrc.js", ".stylelintrc.cjs", ".stylelintrc.mjs", "stylelint.config.js", "stylelint.config.cjs", "stylelint.config.mjs", "package.json:\"stylelint\""];
const EXTRACTED = { package: "vscode-langservers-extracted", version: "4.10.0" };

export const SERVERS: Record<string, ServerDef> = {
  // TypeScript 7 is native, its server built in: the project's own when it has one (19.4), else installed.
  typescript: { name: "typescript", command: "tsc", args: ["--lsp", "--stdio"], npm: { package: "typescript", version: "7.0.2", bin: "tsc" }, when: (root) => !olderTypeScript(root), ownOnly: true },
  // A project on TypeScript 6 or older: vtsls, its own TypeScript bundled.
  vtsls: { name: "vtsls", command: "vtsls", args: ["--stdio"], npm: { package: "@vtsls/language-server", version: "0.3.0", bin: "vtsls" } },
  pyright: { name: "pyright", command: "pyright-langserver", args: ["--stdio"], npm: { package: "pyright", version: "1.1.414", bin: "pyright-langserver" }, config: { python: { analysis: { autoSearchPaths: true, useLibraryCodeForTypes: true, diagnosticMode: "openFilesOnly" } } } },
  "rust-analyzer": { name: "rust-analyzer", command: "rust-analyzer", args: [], hint: "rustup component add rust-analyzer" },
  gopls: { name: "gopls", command: "gopls", args: [], hint: "go install golang.org/x/tools/gopls@latest" },
  "lua-language-server": { name: "lua-language-server", command: "lua-language-server", args: [], hint: "your package manager (brew install lua-language-server)" },
  "bash-language-server": { name: "bash-language-server", command: "bash-language-server", args: ["start"], npm: { package: "bash-language-server", version: "5.8.1", bin: "bash-language-server" } },
  "vscode-json-language-server": { name: "vscode-json-language-server", command: "vscode-json-language-server", args: ["--stdio"], npm: { ...EXTRACTED, bin: "vscode-json-language-server" }, config: { json: { validate: { enable: true } } }, initOptions: { provideFormatter: true } },
  "yaml-language-server": { name: "yaml-language-server", command: "yaml-language-server", args: ["--stdio"], npm: { package: "yaml-language-server", version: "1.24.0", bin: "yaml-language-server" }, config: { redhat: { telemetry: { enabled: false } }, yaml: { validate: true } } },
  taplo: { name: "taplo", command: "taplo", args: ["lsp", "stdio"], hint: "cargo install taplo-cli --locked --features lsp, or brew install taplo" },
  "vscode-css-language-server": { name: "vscode-css-language-server", command: "vscode-css-language-server", args: ["--stdio"], npm: { ...EXTRACTED, bin: "vscode-css-language-server" }, config: { css: { validate: true }, scss: { validate: true }, less: { validate: true } }, initOptions: { provideFormatter: true } },
  "vscode-html-language-server": { name: "vscode-html-language-server", command: "vscode-html-language-server", args: ["--stdio"], npm: { ...EXTRACTED, bin: "vscode-html-language-server" }, config: { html: { validate: { scripts: true, styles: true } } }, initOptions: { provideFormatter: true, embeddedLanguages: { css: true, javascript: true } } },
  "docker-langserver": { name: "docker-langserver", command: "docker-langserver", args: ["--stdio"], npm: { package: "dockerfile-language-server-nodejs", version: "0.15.0", bin: "docker-langserver" } },
  intelephense: { name: "intelephense", command: "intelephense", args: ["--stdio"], npm: { package: "intelephense", version: "1.18.5", bin: "intelephense" } },
  "sourcekit-lsp": { name: "sourcekit-lsp", command: "sourcekit-lsp", args: [], hint: "it comes with Xcode, or the Swift toolchain" },
  clangd: { name: "clangd", command: "clangd", args: [], hint: "your package manager (clangd, or LLVM)" },
  "ruby-lsp": { name: "ruby-lsp", command: "ruby-lsp", args: [], hint: "gem install ruby-lsp" },
  // Linters' servers: add-ons, where the project has their config (19.18). Settings as nvim-lspconfig's.
  eslint: {
    name: "eslint",
    command: "vscode-eslint-language-server",
    args: ["--stdio"],
    npm: { ...EXTRACTED, bin: "vscode-eslint-language-server" },
    requires: ESLINT_CONFIGS,
    config: {
      validate: "on",
      useESLintClass: false,
      experimental: { useFlatConfig: false },
      codeActionOnSave: { enable: false, mode: "all" },
      format: true,
      quiet: false,
      onIgnoredFiles: "off",
      rulesCustomizations: [],
      run: "onType",
      problems: { shortenToSingleLine: false },
      nodePath: "",
      workingDirectory: { mode: "location" },
      codeAction: { disableRuleComment: { enable: true, location: "separateLine" }, showDocumentation: { enable: true } },
    },
  },
  biome: { name: "biome", command: "biome", args: ["lsp-proxy"], npm: { package: "@biomejs/biome", version: "2.5.15", bin: "biome" }, requires: ["biome.json", "biome.jsonc"] },
  stylelint: { name: "stylelint", command: "stylelint-lsp", args: ["--stdio"], npm: { package: "stylelint-lsp", version: "2.0.1", bin: "stylelint-lsp" }, requires: STYLELINT_CONFIGS, config: { stylelintplus: {} } },
  ruff: { name: "ruff", command: "ruff", args: ["server"], requires: ["ruff.toml", ".ruff.toml", "pyproject.toml:[tool.ruff"], hint: "uv tool install ruff, pip install ruff, or brew install ruff" },
};

const JS_ROOTS = ["tsconfig.json", "jsconfig.json", "package.json", ".git"];
const JS_SERVERS = ["typescript", "vtsls", "eslint", "biome"];

/** The project's own TypeScript, when it's older than 7 (no server built in): the major version, else null. */
export function olderTypeScript(root: string): number | null {
  for (let dir = root; ; dir = dirname(dir)) {
    try {
      const major = Number(JSON.parse(readFileSync(join(dir, "node_modules", "typescript", "package.json"), "utf8")).version.split(".")[0]);
      return major < 7 ? major : null;
    } catch {}
    if (dirname(dir) === dir) return null;
  }
}

export const LANGUAGES: LanguageDef[] = [
  { name: "typescript", languageId: "typescript", fileTypes: ["ts", "mts", "cts"], roots: JS_ROOTS, servers: JS_SERVERS },
  { name: "tsx", languageId: "typescriptreact", fileTypes: ["tsx"], roots: JS_ROOTS, servers: JS_SERVERS },
  { name: "javascript", languageId: "javascript", fileTypes: ["js", "mjs", "cjs"], roots: JS_ROOTS, servers: JS_SERVERS },
  { name: "jsx", languageId: "javascriptreact", fileTypes: ["jsx"], roots: JS_ROOTS, servers: JS_SERVERS },
  { name: "python", languageId: "python", fileTypes: ["py", "pyi"], roots: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "pyrightconfig.json", ".git"], servers: ["pyright", "ruff"] },
  { name: "rust", languageId: "rust", fileTypes: ["rs"], roots: ["Cargo.toml", ".git"], servers: ["rust-analyzer"] },
  { name: "go", languageId: "go", fileTypes: ["go"], roots: ["go.work", "go.mod", ".git"], servers: ["gopls"] },
  { name: "lua", languageId: "lua", fileTypes: ["lua"], roots: [".luarc.json", ".luarc.jsonc", ".stylua.toml", "stylua.toml", "selene.toml", ".git"], servers: ["lua-language-server"] },
  { name: "bash", languageId: "shellscript", fileTypes: ["sh", "bash", ".bashrc", ".bash_profile", ".profile"], roots: [".git"], servers: ["bash-language-server"] },
  { name: "json", languageId: "json", fileTypes: ["json"], roots: [".git"], servers: ["vscode-json-language-server", "biome"] },
  { name: "jsonc", languageId: "jsonc", fileTypes: ["jsonc"], roots: [".git"], servers: ["vscode-json-language-server", "biome"] },
  { name: "yaml", languageId: "yaml", fileTypes: ["yaml", "yml"], roots: [".git"], servers: ["yaml-language-server"], linters: ["yamllint"] },
  { name: "toml", languageId: "toml", fileTypes: ["toml"], roots: [".git"], servers: ["taplo"] },
  { name: "css", languageId: "css", fileTypes: ["css"], roots: ["package.json", ".git"], servers: ["vscode-css-language-server", "stylelint", "biome"] },
  { name: "scss", languageId: "scss", fileTypes: ["scss"], roots: ["package.json", ".git"], servers: ["vscode-css-language-server", "stylelint"] },
  { name: "less", languageId: "less", fileTypes: ["less"], roots: ["package.json", ".git"], servers: ["vscode-css-language-server", "stylelint"] },
  { name: "html", languageId: "html", fileTypes: ["html", "htm"], roots: ["package.json", ".git"], servers: ["vscode-html-language-server"] },
  { name: "dockerfile", languageId: "dockerfile", fileTypes: ["Dockerfile", "Containerfile", "dockerfile"], roots: [".git"], servers: ["docker-langserver"], linters: ["hadolint"] },
  { name: "php", languageId: "php", fileTypes: ["php"], roots: ["composer.json", ".git"], servers: ["intelephense"] },
  { name: "swift", languageId: "swift", fileTypes: ["swift"], roots: ["Package.swift", ".git"], servers: ["sourcekit-lsp"] },
  { name: "c", languageId: "c", fileTypes: ["c", "h"], roots: ["compile_commands.json", "compile_flags.txt", ".clangd", ".git"], servers: ["clangd"] },
  { name: "cpp", languageId: "cpp", fileTypes: ["cc", "cpp", "cxx", "hpp", "hh", "hxx"], roots: ["compile_commands.json", "compile_flags.txt", ".clangd", ".git"], servers: ["clangd"] },
  { name: "ruby", languageId: "ruby", fileTypes: ["rb", "Gemfile", "Rakefile"], roots: ["Gemfile", ".git"], servers: ["ruby-lsp"] },
];

/** The servers and languages in effect: the built-in ones with the user's config over them. */
export interface ServerTable {
  servers: Record<string, ServerDef>;
  languages: LanguageDef[];
}

/** The language of a file, by its whole name, then its extension; null for none slipbox serves. */
export function languageOf(table: ServerTable, path: string): LanguageDef | null {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  return table.languages.find((l) => l.fileTypes.includes(base)) ?? (ext ? (table.languages.find((l) => l.fileTypes.includes(ext)) ?? null) : null);
}

/** Whether a project (its top folder) asks for an add-on: one of its files there, holding its text if given. */
export function projectAsks(root: string, requires: string[]): boolean {
  return requires.some((r) => {
    const colon = r.indexOf(":");
    const file = colon < 0 ? r : r.slice(0, colon);
    const path = join(root, file);
    if (!existsSync(path)) return false;
    if (colon < 0) return true;
    try {
      return readFileSync(path, "utf8").includes(r.slice(colon + 1));
    } catch {
      return false;
    }
  });
}

/** A server in Helix's shape, as the user's config writes it (`[language-server.<name>]`). */
export interface ServerConfig {
  command?: string;
  args?: string[];
  config?: Record<string, unknown>;
  environment?: Record<string, string>;
  "required-root-patterns"?: string[];
}

/** A language in Helix's shape (`[[language]]`). */
export interface LanguageConfig {
  name: string;
  "language-servers"?: (string | { name: string; "only-features"?: Feature[]; "except-features"?: Feature[] })[];
  roots?: string[];
  "file-types"?: string[];
  "language-id"?: string;
  /** Its linters without a server (19.19), by name (`[linter.<name>]`). */
  linters?: string[];
}

/**
 * The table in effect: the built-in one, each server the config names changed or added (its settings
 * merged over the defaults), each language changed or added — its servers, roots and file types
 * replaced when given, as Helix has it.
 */
export function serverTable(servers: Record<string, ServerConfig> = {}, languages: LanguageConfig[] = []): ServerTable {
  const out: Record<string, ServerDef> = { ...SERVERS };
  for (const [name, c] of Object.entries(servers)) {
    const base = out[name] ?? { name, command: name, args: [] };
    out[name] = {
      ...base,
      // A command of its own: what's run is the user's choice, never slipbox's install.
      ...(c.command ? { command: c.command, npm: undefined } : {}),
      ...(c.args ? { args: c.args } : {}),
      ...(c.config ? { config: deepMerge(base.config ?? {}, c.config) } : {}),
      ...(c.environment ? { environment: { ...base.environment, ...c.environment } } : {}),
      ...(c["required-root-patterns"] ? { requires: c["required-root-patterns"] } : {}),
    };
  }
  const langs = LANGUAGES.map((l) => ({ ...l }));
  for (const c of languages) {
    const known = langs.find((l) => l.name === c.name);
    const l = known ?? { name: c.name, languageId: c["language-id"] ?? c.name, fileTypes: [], roots: [".git"], servers: [] };
    if (c["language-servers"]) {
      l.servers = c["language-servers"].map((s) => (typeof s === "string" ? s : s.name));
      l.features = Object.fromEntries(
        c["language-servers"].flatMap((s) => (typeof s === "string" ? [] : [[s.name, { only: s["only-features"], except: s["except-features"] }]])),
      );
    }
    if (c.roots) l.roots = c.roots;
    if (c["file-types"]) l.fileTypes = c["file-types"];
    if (c["language-id"]) l.languageId = c["language-id"];
    if (c.linters) l.linters = c.linters;
    if (!known) langs.push(l);
  }
  return { servers: out, languages: langs };
}

/** `b` over `a`, tables merged all the way down (lists and values replaced). */
export function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const was = out[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && was && typeof was === "object" && !Array.isArray(was) ? deepMerge(was as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out;
}
