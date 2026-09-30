// Code-fence syntax highlighting (plan 2.5) with highlight.js — pure JS, so it lives in the core
// and the CLI's `render` highlights exactly as the TUI does. Only named languages are
// highlighted; auto-detection is slow and often wrong.

import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import lua from "highlight.js/lib/languages/lua";
import makefile from "highlight.js/lib/languages/makefile";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import vim from "highlight.js/lib/languages/vim";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import type { Role } from "../theme/theme.ts";

const LANGS: Record<string, unknown> = {
  bash, c, cpp, css, diff, dockerfile, go, ini, java, javascript, json, lua, makefile, markdown,
  python, ruby, rust, shell, sql, typescript, vim, xml, yaml,
};
for (const [name, lang] of Object.entries(LANGS)) hljs.registerLanguage(name, lang as never);
hljs.registerAliases(["sh", "zsh", "console"], { languageName: "bash" });
hljs.registerAliases(["toml"], { languageName: "ini" });
hljs.registerAliases(["jsonc", "json5"], { languageName: "json" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });
hljs.registerAliases(["tsx", "ts"], { languageName: "typescript" });
hljs.registerAliases(["jsx", "js", "mjs"], { languageName: "javascript" });

const SCOPE_ROLES: Record<string, Role> = {
  keyword: "syn_keyword",
  built_in: "syn_builtin",
  type: "syn_type",
  literal: "syn_constant",
  number: "syn_number",
  operator: "syn_operator",
  punctuation: "syn_punctuation",
  property: "syn_attr",
  regexp: "syn_regexp",
  string: "syn_string",
  char: "syn_constant",
  subst: "syn_variable",
  symbol: "syn_constant",
  class: "syn_type",
  function: "syn_function",
  title: "syn_function",
  params: "syn_variable",
  comment: "syn_comment",
  doctag: "syn_keyword",
  meta: "syn_meta",
  section: "syn_section",
  tag: "syn_tag",
  name: "syn_tag",
  attr: "syn_attr",
  attribute: "syn_attr",
  variable: "syn_variable",
  "template-variable": "syn_variable",
  "template-tag": "syn_tag",
  bullet: "syn_punctuation",
  code: "syn_string",
  link: "syn_string",
  quote: "syn_comment",
  "selector-tag": "syn_tag",
  "selector-id": "syn_attr",
  "selector-class": "syn_attr",
  "selector-attr": "syn_attr",
  "selector-pseudo": "syn_attr",
  addition: "syn_addition",
  deletion: "syn_deletion",
};

function roleForClasses(classes: string): Role | null {
  const parts = classes.split(/\s+/);
  const main = parts[0]?.replace(/^hljs-/, "") ?? "";
  if (main === "title" && parts.includes("class_")) return "syn_type";
  return SCOPE_ROLES[main] ?? null;
}

export interface Token {
  text: string;
  role: Role | null;
}

export function hasLanguage(lang: string): boolean {
  return !!hljs.getLanguage(lang);
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };

/** Blocks highlighted, by language and text: highlighting doesn't depend on the width, so a re-wrap
 *  (a resize, a pane toggled) reuses it (plan 15.1). The oldest go first past either bound. */
const done = new Map<string, Token[][] | null>();
let doneChars = 0;
const DONE_MAX = 8000;
const DONE_CHARS = 8 * 1024 * 1024;

/**
 * Highlight a code block. Returns one token list per source line, or null for plain text. The
 * lists are shared between calls with the same text: read them, never change them.
 */
export function highlight(code: string, lang: string | null | undefined): Token[][] | null {
  if (!lang) return null;
  const name = lang.toLowerCase();
  if (!hljs.getLanguage(name)) return null;
  const key = `${name}\u0000${code}`;
  const hit = done.get(key);
  if (hit !== undefined) return hit;
  const lines = highlightNow(code, name);
  done.set(key, lines);
  doneChars += key.length;
  for (const [k] of done) {
    if (done.size <= DONE_MAX && doneChars <= DONE_CHARS) break;
    done.delete(k);
    doneChars -= k.length;
  }
  return lines;
}

function highlightNow(code: string, name: string): Token[][] | null {
  let html: string;
  try {
    html = hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
  const lines: Token[][] = [[]];
  const stack: (Role | null)[] = [];
  const re = /<span class="([^"]+)">|<\/span>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      stack.push(roleForClasses(m[1]) ?? stack[stack.length - 1] ?? null);
    } else if (m[0] === "</span>") {
      stack.pop();
    } else if (m[2] !== undefined) {
      const text = m[2].replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (e) => ENTITIES[e] ?? e);
      const role = stack[stack.length - 1] ?? null;
      const parts = text.split("\n");
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1]!.push({ text: part, role });
      });
    }
  }
  return lines;
}
