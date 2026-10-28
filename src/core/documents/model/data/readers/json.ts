// Original JSON-comment stripping and next-token rules.

// ---------------------------------------------------------------------------------------------
// YAML and JSON
/** Past whitespace and comments from `k`: the index of the next character that says something. */
export function nextSignificant(s: string, k: number): number {
  while (k < s.length) {
    if (/\s/.test(s[k]!)) k++;
    else if (s.startsWith("//", k)) while (k < s.length && s[k] !== "\n") k++;
    else if (s.startsWith("/*", k)) {
      const end = s.indexOf("*/", k + 2);
      k = end < 0 ? s.length : end + 2;
    } else break;
  }
  return k;
}

/**
 * JSON as editors read it (jsonc: tsconfig.json, VS Code's settings) as JSON: // and /* comments
 * and trailing commas blanked, strings kept — every other character where it was.
 */
export function stripJsonComments(s: string): string {
  let out = "";
  let str = false;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k]!;
    if (str) {
      out += ch;
      if (ch === "\\") out += s[++k] ?? "";
      else if (ch === '"') str = false;
    } else if (ch === '"') {
      str = true;
      out += ch;
    } else if (ch === ",") {
      const next = s[nextSignificant(s, k + 1)];
      out += next === "}" || next === "]" ? " " : ch;
    } else if (s.startsWith("//", k)) {
      while (k < s.length && s[k] !== "\n") k++;
      out += "\n";
    } else if (s.startsWith("/*", k)) {
      const end = s.indexOf("*/", k + 2);
      const body = s.slice(k, end < 0 ? s.length : end + 2);
      out += body.replace(/[^\n]/g, " ");
      k = (end < 0 ? s.length : end + 2) - 1;
    } else out += ch;
  }
  return out;
}
