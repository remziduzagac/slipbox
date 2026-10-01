// A language server for the client's tests (plan 19.1): a warning on each line holding BAD — sent, or
// asked for with FAKE_PULL=1 (late for a text with SLOW) — that says the settings it was given; it exits
// on CRASH; on REFRESH it asks the client to ask again, as pyright does; hover says the line.
import { createConnection, DiagnosticSeverity, ProposedFeatures, TextDocuments, TextDocumentSyncKind } from "vscode-languageserver/node";
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
docs.listen(conn);
conn.listen();
