// Keep offsets and literal text while blanking comments for the migration check's type/path scans.
// Templates are opaque here; computed paths inside them still require review.
// Declaration scans may also mask regex literals and template contents, preserving quotes and source offsets.
export function withoutComments(text: string, maskCodeLiterals = false): string {
  const out = text.split("");
  const quotedEnd = (start: number, quote: string): number => {
    let at = start + 1;
    while (at < text.length) {
      if (text[at] === "\\") at += 2;
      else if (text[at++] === quote) break;
    }
    return at;
  };
  const regexEnd = (start: number): number => {
    let at = start + 1;
    let inClass = false;
    while (at < text.length) {
      const c = text[at++];
      if (c === "\\") at++;
      else if (c === "\n" || c === "\r") break;
      else if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) break;
    }
    while (at < text.length && /[a-z]/i.test(text[at]!)) at++;
    return at;
  };
  const templateEnd = (start: number): number => {
    let at = start + 1;
    while (at < text.length) {
      if (text[at] === "\\") at += 2;
      else if (text[at] === "`") return at + 1;
      else if (text[at] === "$" && text[at + 1] === "{") at = expressionEnd(at + 2);
      else at++;
    }
    return at;
  };
  const expressionEnd = (start: number): number => {
    let at = start;
    let depth = 1;
    let mayStartRegex = true;
    while (at < text.length) {
      const c = text[at]!;
      if (/\s/.test(c)) at++;
      else if (text.startsWith("++", at) || text.startsWith("--", at)) at += 2;
      else if (c === '"' || c === "'") {
        at = quotedEnd(at, c);
        mayStartRegex = false;
      } else if (c === "`") {
        at = templateEnd(at);
        mayStartRegex = false;
      } else if (c === "/" && text[at + 1] === "/") {
        while (at < text.length && !"\r\n".includes(text[at]!)) at++;
      } else if (c === "/" && text[at + 1] === "*") {
        at += 2;
        while (at < text.length && !(text[at] === "*" && text[at + 1] === "/")) at++;
        at = Math.min(at + 2, text.length);
      } else if (c === "/" && mayStartRegex) {
        at = regexEnd(at);
        mayStartRegex = false;
      } else if (/[A-Za-z_$0-9]/.test(c)) {
        const word = at++;
        while (at < text.length && /[\w$]/.test(text[at]!)) at++;
        mayStartRegex = ["return", "throw", "case", "typeof", "void", "delete", "yield", "await", "in", "of"].includes(
          text.slice(word, at),
        );
      } else {
        if (c === "{") depth++;
        else if (c === "}" && --depth === 0) return at + 1;
        mayStartRegex = "(,=:[!&|?{};+-*/%~^<>".includes(c);
        at++;
      }
    }
    return at;
  };
  let regexAllowed = true;
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let p = from; p < to; p++) if (text[p] !== "\n" && text[p] !== "\r") out[p] = " ";
  };
  while (i < text.length) {
    const c = text[i]!;
    if (c === "\n" || c === "\r") {
      regexAllowed = true;
      i++;
    } else if (/\s/.test(c)) {
      i++;
    } else if (maskCodeLiterals && (text.startsWith("++", i) || text.startsWith("--", i))) {
      i += 2;
    } else if (c === "`" && maskCodeLiterals) {
      const from = i;
      i = templateEnd(i);
      blank(from + 1, i - 1);
      regexAllowed = false;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < text.length) {
        if (text[i] === "\\") i += 2;
        else if (text[i++] === quote) break;
      }
      regexAllowed = false;
    } else if (c === "/" && (text[i + 1] === "/" || text[i + 1] === "*")) {
      const from = i;
      const block = text[i + 1] === "*";
      i += 2;
      if (block) {
        while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i = Math.min(i + 2, text.length);
      } else {
        while (i < text.length && text[i] !== "\n" && text[i] !== "\r") i++;
      }
      blank(from, i);
    } else if (c === "/" && regexAllowed) {
      const from = i;
      let inClass = false;
      i++;
      while (i < text.length) {
        const part = text[i++]!;
        if (part === "\\") i++;
        else if (part === "\n" || part === "\r") break;
        else if (part === "[") inClass = true;
        else if (part === "]") inClass = false;
        else if (part === "/" && !inClass) break;
      }
      while (i < text.length && /[a-z]/i.test(text[i]!)) i++;
      if (maskCodeLiterals) blank(from, i);
      regexAllowed = false;
    } else if (/[A-Za-z_$0-9]/.test(c)) {
      const from = i++;
      while (i < text.length && /[\w$]/.test(text[i]!)) i++;
      regexAllowed = ["return", "throw", "case", "typeof", "void", "delete", "yield", "await", "in", "of"].includes(
        text.slice(from, i),
      );
    } else {
      regexAllowed = "(,=:[!&|?{};+-*/%~^<>".includes(c);
      i++;
    }
  }
  return out.join("");
}
