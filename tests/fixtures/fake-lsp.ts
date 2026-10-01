// A language server for the client's tests (plan 19.1): a warning on each line holding BAD — sent, or
// asked for with FAKE_PULL=1 (late for a text with SLOW) — that says the settings it was given; it exits
// on CRASH; on REFRESH it asks the client to ask again, as pyright does; hover says the line.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createConnection, DiagnosticSeverity, ProposedFeatures, TextDocuments, TextDocumentSyncKind, type TextEdit } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

const conn = createConnection(ProposedFeatures.all);
const docs = new TextDocuments(TextDocument);
const pull = process.env.FAKE_PULL === "1";
let settings: unknown = null;
/** Files it has asked the client to ask about again: they get one more problem after that. */
const refreshed = new Set<string>();

conn.onInitialize((p) => ({
  capabilities: {
    textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Incremental, save: { includeText: true } },
    hoverProvider: true,
    definitionProvider: true,
    referencesProvider: true,
    documentSymbolProvider: true,
    renameProvider: { prepareProvider: true },
    codeActionProvider: { resolveProvider: true },
    executeCommandProvider: { commands: ["fake.fixAll"] },
    documentFormattingProvider: true,
    ...(pull ? { diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false } } : {}),
  },
  serverInfo: { name: `fake (root ${p.rootUri})` },
}));
conn.onInitialized(async () => {
  settings = await conn.workspace.getConfiguration("fake");
});

const problems = (doc: TextDocument | undefined) => [
  ...(doc?.getText().split("\n") ?? []).flatMap((line, i) =>
    line.includes("BAD") ? [{ range: { start: { line: i, character: line.indexOf("BAD") }, end: { line: i, character: line.indexOf("BAD") + 3 } }, severity: DiagnosticSeverity.Warning, source: "fake", message: `bad, with ${JSON.stringify(settings)}` }] : [],
  ),
  ...(doc && refreshed.has(doc.uri) ? [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: DiagnosticSeverity.Hint, source: "fake", message: "after a refresh" }] : []),
];

docs.onDidChangeContent((e) => {
  refreshed.delete(e.document.uri); // the refresh's problem is the text's it came with
  if (e.document.getText().includes("CRASH")) process.exit(3);
  // As pyright does: asks the client to ask again, and dies if that fails (an unhandled rejection);
  // ASK, the same with a method no client knows.
  const ask = e.document.getText().includes("REFRESH") ? "workspace/diagnostic/refresh" : e.document.getText().includes("ASK") ? "custom/ask" : null;
  // A moment later: what it finds changes, and it asks the client to ask again.
  if (ask) {
    setTimeout(() => {
      if (ask === "workspace/diagnostic/refresh") refreshed.add(e.document.uri);
      conn.sendRequest(ask).then(
        () => {},
        (err: Error) => {
          console.error(`error: ${err.message}`);
          process.exit(5);
        },
      );
    }, 300);
  }
  if (!pull) void conn.sendDiagnostics({ uri: e.document.uri, version: e.document.version, diagnostics: problems(e.document) });
});
conn.languages.diagnostics.on(async (p) => {
  const doc = docs.get(p.textDocument.uri);
  const items = problems(doc);
  // SLOW: answered late, after an answer about a newer text.
  if (doc?.getText().includes("SLOW")) await new Promise((r) => setTimeout(r, 400));
  return { kind: "full", items };
});
conn.onHover((p) => ({ contents: { kind: "markdown", value: `line ${p.position.line}: ${docs.get(p.textDocument.uri)?.getText().split("\n")[p.position.line] ?? ""}` } }));
// The definition: the first line holding DEF; the references: each line holding REF.
const linesWith = (uri: string, word: string) =>
  (docs.get(uri)?.getText().split("\n") ?? []).flatMap((l, i) => (l.includes(word) ? [{ uri, range: { start: { line: i, character: l.indexOf(word) }, end: { line: i, character: l.indexOf(word) + word.length } } }] : []));
conn.onDefinition((p) => linesWith(p.textDocument.uri, "DEF")[0] ?? null);
conn.onReferences((p) => linesWith(p.textDocument.uri, "REF"));
// Symbols: each `function NAME` line, its `method NAME` lines nested under it.
conn.onDocumentSymbol((p) => {
  const out: { name: string; kind: number; range: unknown; selectionRange: unknown; children: unknown[] }[] = [];
  (docs.get(p.textDocument.uri)?.getText().split("\n") ?? []).forEach((l, i) => {
    const m = /^\s*(function|method) (\w+)/.exec(l);
    if (!m) return;
    const range = { start: { line: i, character: 0 }, end: { line: i, character: l.length } };
    const sym = { name: m[2]!, kind: m[1] === "function" ? 12 : 6, range, selectionRange: range, children: [] };
    if (m[1] === "method" && out.length) out[out.length - 1]!.children.push(sym);
    else out.push(sym);
  });
  return out as never;
});
// Rename: the word under the cursor, everywhere in the file — and in other.fk beside it, on disk.
const wordAt = (text: string, line: number, character: number) => {
  const l = text.split("\n")[line] ?? "";
  let a = character;
  let b = character;
  while (a > 0 && /\w/.test(l[a - 1]!)) a--;
  while (b < l.length && /\w/.test(l[b]!)) b++;
  return { word: l.slice(a, b), range: { start: { line, character: a }, end: { line, character: b } } };
};
const replaceAll = (text: string, word: string, by: string): TextEdit[] =>
  text.split("\n").flatMap((l, i) => [...l.matchAll(new RegExp(`\\b${word}\\b`, "g"))].map((m) => ({ range: { start: { line: i, character: m.index! }, end: { line: i, character: m.index! + word.length } }, newText: by })));
conn.onPrepareRename((p) => {
  const w = wordAt(docs.get(p.textDocument.uri)!.getText(), p.position.line, p.position.character);
  return w.word ? { range: w.range, placeholder: w.word } : null;
});
conn.onRenameRequest((p) => {
  const text = docs.get(p.textDocument.uri)!.getText();
  const w = wordAt(text, p.position.line, p.position.character).word;
  const other = pathToFileURL(fileURLToPath(p.textDocument.uri).replace(/[^/]+$/, "other.fk")).href;
  let otherText = "";
  try {
    otherText = readFileSync(fileURLToPath(other), "utf8");
  } catch {}
  return { changes: { [p.textDocument.uri]: replaceAll(text, w, p.newName), ...(otherText ? { [other]: replaceAll(otherText, w, p.newName) } : {}) } };
});
// Code actions: for a BAD problem, its fix; a command that asks the client to fix them all; one resolved late.
conn.onCodeAction((p) => [
  ...p.context.diagnostics.filter((d) => String(d.message).startsWith("bad")).map((d) => ({ title: "Replace BAD with GOOD", kind: "quickfix", isPreferred: true, diagnostics: [d], edit: { changes: { [p.textDocument.uri]: [{ range: d.range, newText: "GOOD" }] } } })),
  { title: "Fix all (a command)", kind: "source.fixAll", command: { title: "Fix all", command: "fake.fixAll", arguments: [p.textDocument.uri] } },
  { title: "Lazy fix", kind: "quickfix", data: p.textDocument.uri },
]);
conn.onCodeActionResolve((a) => ({ ...a, edit: { changes: { [a.data as string]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "LAZY " }] } } }));
conn.onExecuteCommand(async (p) => {
  const uri = p.arguments![0] as string;
  await conn.workspace.applyEdit({ changes: { [uri]: replaceAll(docs.get(uri)!.getText(), "BAD", "FIXED") } });
  return null;
});
// Formatting: runs of spaces made one.
conn.onDocumentFormatting((p) =>
  docs.get(p.textDocument.uri)!.getText().split("\n").flatMap((l, i) => (/ {2,}/.test(l) ? [{ range: { start: { line: i, character: 0 }, end: { line: i, character: l.length } }, newText: l.replace(/ {2,}/g, " ") }] : [])),
);
docs.listen(conn);
conn.listen();
