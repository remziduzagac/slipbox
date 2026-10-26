// Keep offsets and literal text while blanking comments for the migration check's type/path scans.
// Templates are opaque here; computed paths inside them still require review.
export function withoutComments(text: string): string {
  const out = text.split("");
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
