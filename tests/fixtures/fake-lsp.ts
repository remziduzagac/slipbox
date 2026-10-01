// A language server for the client's tests (plan 19.1): a warning on each line holding BAD — sent, or
// asked for with FAKE_PULL=1 (late for a text with SLOW) — that says the settings it was given; it exits
// on CRASH; hover says the line.
import { createConnection, DiagnosticSeverity, ProposedFeatures, TextDocuments, TextDocumentSyncKind } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

const conn = createConnection(ProposedFeatures.all);
const docs = new TextDocuments(TextDocument);
const pull = process.env.FAKE_PULL === "1";
let settings: unknown = null;

conn.onInitialize((p) => ({
  capabilities: {
    textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Incremental, save: { includeText: true } },
    hoverProvider: true,
    ...(pull ? { diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false } } : {}),
  },
  serverInfo: { name: `fake (root ${p.rootUri})` },
}));
conn.onInitialized(async () => {
  settings = await conn.workspace.getConfiguration("fake");
});

const problems = (doc: TextDocument | undefined) =>
  (doc?.getText().split("\n") ?? []).flatMap((line, i) =>
    line.includes("BAD") ? [{ range: { start: { line: i, character: line.indexOf("BAD") }, end: { line: i, character: line.indexOf("BAD") + 3 } }, severity: DiagnosticSeverity.Warning, source: "fake", message: `bad, with ${JSON.stringify(settings)}` }] : [],
  );

docs.onDidChangeContent((e) => {
  if (e.document.getText().includes("CRASH")) process.exit(3);
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
docs.listen(conn);
conn.listen();
