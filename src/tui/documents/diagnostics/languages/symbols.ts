// Server symbols converted to the existing stable outline representation.

import type { OutlineEntry } from "../../../../core/documents/syntax/syntax.ts";
import type { DocumentSymbol, SymbolInformation } from "vscode-languageserver-protocol";
import { SymbolKind } from "vscode-languageserver-protocol";

/** A symbol's kind by its number, as the outline names it (`function`, `class`). */
export const KIND_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(SymbolKind).map(([name, n]) => [n, name.toLowerCase()]),
);

/** A server's symbols as an outline: nested ones (`DocumentSymbol`) by their depth, flat ones in line order. */
export function outlineOf(symbols: DocumentSymbol[] | SymbolInformation[]): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  const walk = (list: DocumentSymbol[], depth: number) => {
    for (const d of [...list].sort((a, b) => a.selectionRange.start.line - b.selectionRange.start.line)) {
      out.push({ name: d.name, kind: KIND_NAMES[d.kind] ?? "symbol", line: d.selectionRange.start.line + 1, depth });
      if (d.children?.length) walk(d.children, depth + 1);
    }
  };
  if (symbols.length && "selectionRange" in symbols[0]!) walk(symbols as DocumentSymbol[], 0);
  else
    for (const i of [...(symbols as SymbolInformation[])].sort(
      (a, b) => a.location.range.start.line - b.location.range.start.line,
    ))
      out.push({ name: i.name, kind: KIND_NAMES[i.kind] ?? "symbol", line: i.location.range.start.line + 1, depth: 0 });
  return out;
}
