// The commands of language servers (`lsp.*`, 3.x): hover, definitions, references, renames, code actions,
// formatting, symbols — each asked of the server for the file on screen.

import { type Run, withView } from "./actions.ts";
import { landingText, findHeading } from "../core/workspace/links/landing.ts";
import { isAbsolute } from "node:path";
import { markdownText } from "./actions-links.ts";
import type {
  Hover,
  Location,
  Range,
  WorkspaceEdit,
  CodeAction,
  Command as LspCommand,
  TextEdit,
  MarkupContent,
  MarkedString,
  LocationLink,
} from "vscode-languageserver-protocol";
import { pathToFileURL, fileURLToPath } from "node:url";
import type { PromptOverlay, App, View } from "./app.ts";
import { type Problem, noteProblems } from "../core/diagnostics.ts";
import type { Feature } from "../core/servers/languages.ts";
import { readFileSync } from "node:fs";

/** Language servers (3.x): hover, definitions, references, renames, code actions, symbols. */
export function lspActions(): Record<string, Run> {
  return {
    // What's under the cursor (19.12, 19.13): a code file's language server answers; in a note, slipbox does.
    "lsp.hover": (a) =>
      withView(a, async (v) => {
        if (v.buf.rel && a.graph.notes.has(v.buf.rel)) {
          const link =
            a.linking.linkUnderCursor(v) >= 0 ? a.currentLayout(v).links[a.linking.linkUnderCursor(v)] : undefined;
          if (!link) return a.message("info", "nothing to show here: on a link, where it lands");
          const r = a.graph.resolveLink(
            { kind: link.kind === "embed" ? "embed" : link.kind === "wiki" ? "wiki" : "markdown", target: link.target },
            link.from ?? v.buf.rel,
          );
          if (r.resolvedKind !== "note" && r.resolvedKind !== "anchor")
            return a.message(
              "info",
              `${link.target}: ${r.resolvedKind === "ambiguous" ? `matches ${r.candidates.join(", ")}` : r.resolvedKind === "external" ? link.target : (r.reason ?? "no such note yet")}`,
            );
          const path = r.resolvedKind === "anchor" ? v.buf.rel : r.path!;
          // A path's `#fragment`: a heading (by its slug or text), or a block's `^id` (20.2).
          let frag = link.heading;
          if (!frag && link.target.includes("#")) {
            frag = link.target.slice(link.target.indexOf("#") + 1);
            try {
              frag = decodeURIComponent(frag);
            } catch {}
          }
          const block = frag?.startsWith("^") ? frag.slice(1) : null;
          const wiki = link.kind === "wiki" || link.kind === "embed";
          const text = landingText(a.graph, path, block ? null : frag, block, undefined, wiki);
          const entry = frag && !block ? a.graph.entryAnywhere(path) : undefined;
          const hit = entry && frag ? findHeading(entry.headings, entry.anchors ?? [], frag, wiki) : null;
          const heading = block ? null : (hit?.heading != null ? entry!.headings[hit.heading]!.text : null) || frag;
          // Titled by its path as shown (21.9): from this root, else `~/…`, else absolute.
          const shown = isAbsolute(path) ? a.graph.shownPath(path) : path;
          // A heading or block that isn't there: said, and where following lands, the note's top (DF-D26).
          const top = text === null && frag ? landingText(a.graph, path, null, null) : null;
          if (top !== null) {
            const what = block ? `block ^${block}` : `heading "${frag}"`;
            return a.overlays.openHover(
              `*No ${markdownText(what)} in ${markdownText(shown)}: the link opens the note at its top.*\n\n${top}`,
              shown,
            );
          }
          return a.overlays.openHover(
            text ?? "(nothing there)",
            `${shown}${block ? ` ^${block}` : heading ? ` › ${heading}` : ""}`,
          );
        }
        a.languages.sync(v.buf);
        const s = a.languages.servers;
        if (!s?.isOpen(v.buf.abs))
          return a.message("info", "no language server for this file (slipbox doctor says which it would have)");
        const answer = await s.request<Hover>(
          v.buf.abs,
          "textDocument/hover",
          { textDocument: { uri: pathToFileURL(v.buf.abs).href }, position: a.languages.position(v) },
          "hoverProvider",
          "hover",
        );
        const text = answer ? hoverText(answer.result) : "";
        if (!text.trim()) return a.message("info", "the language server has nothing to say here");
        a.overlays.openHover(text, `${answer!.server}`);
      }),
    "lsp.definition": (a) =>
      withView(a, async (v) => {
        if (v.buf.rel && a.graph.notes.has(v.buf.rel)) return void a.run("link.follow");
        await goTo(a, v, "textDocument/definition", "definitionProvider", "goto-definition", [
          "definition",
          "definitions",
        ]);
      }),
    // Where the type of what's under the cursor is defined, and what implements it (19.13).
    "lsp.type_definition": (a) =>
      withView(a, (v) =>
        goTo(a, v, "textDocument/typeDefinition", "typeDefinitionProvider", "goto-type-definition", [
          "type definition",
          "type definitions",
        ]),
      ),
    "lsp.implementation": (a) =>
      withView(a, (v) =>
        goTo(a, v, "textDocument/implementation", "implementationProvider", "goto-implementation", [
          "implementation",
          "implementations",
        ]),
      ),
    "lsp.references": (a) =>
      withView(a, async (v) => {
        if (v.buf.rel && a.graph.notes.has(v.buf.rel)) return void a.run("backlinks.open");
        a.languages.sync(v.buf);
        const s = a.languages.servers;
        if (!s?.isOpen(v.buf.abs))
          return a.message("info", "no language server for this file (slipbox doctor says which it would have)");
        // Every server that finds references has its say, together.
        const answers = await s.requestAll<Location[]>(
          v.buf.abs,
          "textDocument/references",
          {
            textDocument: { uri: pathToFileURL(v.buf.abs).href },
            position: a.languages.position(v),
            context: { includeDeclaration: false },
          },
          "referencesProvider",
          "goto-reference",
        );
        const seen = new Set<string>();
        const locs = answers
          .flatMap((x) => locations(x.result))
          .filter((l) => {
            const key = `${l.path}:${l.line}:${l.character}`;
            return !seen.has(key) && !!seen.add(key);
          });
        if (!locs.length) return a.message("info", "no references found");
        pickLocation(a, `${locs.length} reference${locs.length === 1 ? "" : "s"}`, locs);
      }),
    // What a code file's language server changes (19.15): a rename, its fixes, its formatting.
    "lsp.rename": (a, arg) =>
      withView(a, async (v) => {
        if (v.buf.rel && a.graph.notes.has(v.buf.rel))
          return void a.run(arg ? `heading.rename ${arg}` : "heading.rename");
        a.languages.sync(v.buf);
        const s = a.languages.servers;
        if (!s?.isOpen(v.buf.abs))
          return a.message("info", "no language server for this file (slipbox doctor says which it would have)");
        const where = { textDocument: { uri: pathToFileURL(v.buf.abs).href }, position: a.languages.position(v) };
        const prep = await s.request<Range | { range: Range; placeholder: string } | { defaultBehavior: boolean }>(
          v.buf.abs,
          "textDocument/prepareRename",
          where,
          "renameProvider",
          "rename-symbol",
        );
        const range =
          prep && "start" in prep.result ? prep.result : prep && "range" in prep.result ? prep.result.range : null;
        const word = range ? textIn(v.buf.source, v.buf.lineStarts(), range) : "";
        const name = prep && "placeholder" in prep.result ? prep.result.placeholder : word;
        const go = async (to: string) => {
          const r = await s.request<WorkspaceEdit>(
            v.buf.abs,
            "textDocument/rename",
            { ...where, newName: to },
            "renameProvider",
            "rename-symbol",
          );
          if (!r) return a.message("warn", "the language server can't rename this");
          a.languages.previewWorkspaceEdit(`rename ${name || "it"} → ${to}`, r.result);
          a.host.requestRender();
        };
        if (arg) return go(arg);
        a.overlays.prompt(`rename ${name || "this"} to: `, (to) => void (to.trim() && go(to.trim())));
        (a.overlay as PromptOverlay).text = name;
      }),
    "lsp.code_action": (a) =>
      withView(a, async (v) => {
        a.languages.sync(v.buf);
        const s = a.languages.servers;
        // In a note, slipbox's own fixes for the cursor's line too (a fragile link named for sure).
        const line = a.languages.position(v).line + 1;
        const own =
          v.buf.kind.group === "note" && v.buf.rel !== null
            ? noteProblems(a.graph, v.buf.rel).filter((p) => p.fix && p.start.line <= line && line <= p.end.line)
            : [];
        const fix = (p: Problem) => {
          const starts = v.buf.lineStarts();
          const at = starts[p.start.line - 1]! + p.start.column - 1;
          const to = starts[p.end.line - 1]! + p.end.column - 1;
          a.views.applyNoteEdits([{ at, length: to - at, text: p.fix!.text }], p.fix!.title);
        };
        if (!s?.isOpen(v.buf.abs)) {
          if (!own.length)
            return a.message("info", "code actions are a language server's: none for this file (slipbox doctor)");
          return a.overlays.openList({
            title: "Code actions",
            items: own.map((p) => ({ label: p.fix!.title, hint: "slipbox", data: p })),
            accept: (item) => fix(item.data as Problem),
          });
        }
        const position = a.languages.position(v);
        const range = { start: position, end: position };
        // The problems on this line, as each server gave them: its fixes for them.
        const diagnostics = [...v.buf.serverProblems.values()]
          .filter((p) => p.version === v.buf.version)
          .flatMap((p) => p.raw)
          .filter((d) => d.range.start.line <= position.line && position.line <= d.range.end.line);
        const answers = await s.requestAll<(CodeAction | LspCommand)[]>(
          v.buf.abs,
          "textDocument/codeAction",
          { textDocument: { uri: pathToFileURL(v.buf.abs).href }, range, context: { diagnostics } },
          "codeActionProvider",
          "code-action",
        );
        const actions = answers
          .flatMap((x) => x.result.map((action) => ({ action, server: x.server })))
          .filter(({ action }) => !("disabled" in action && action.disabled));
        if (!actions.length && !own.length) return a.message("info", "no code actions here");
        actions.sort(
          (x, y) =>
            Number("isPreferred" in y.action && !!y.action.isPreferred) -
            Number("isPreferred" in x.action && !!x.action.isPreferred),
        );
        a.overlays.openList({
          title: "Code actions",
          items: [
            ...own.map((p) => ({ label: p.fix!.title, hint: "slipbox", data: { own: p } })),
            ...actions.map((x) => ({ label: x.action.title, hint: x.server, data: x })),
          ],
          accept: (item) => {
            const d = item.data as { own?: Problem } & { action: CodeAction | LspCommand; server: string };
            if (d.own) return fix(d.own);
            void runAction(a, v.buf.abs, d);
          },
        });
      }),
    "lsp.format": (a) =>
      withView(a, async (v) => {
        a.languages.sync(v.buf);
        const s = a.languages.servers;
        if (!s?.isOpen(v.buf.abs))
          return a.message("info", "formatting is a language server's: none for this file (slipbox doctor)");
        // The file's own indentation (25.1): its .editorconfig, else its lines, else its language's — never a fixed 2.
        const indent = v.buf.indent();
        const options = { tabSize: indent.size, insertSpaces: !indent.tabs };
        const r = await s.request<TextEdit[]>(
          v.buf.abs,
          "textDocument/formatting",
          { textDocument: { uri: pathToFileURL(v.buf.abs).href }, options },
          "documentFormattingProvider",
          "format",
        );
        if (!r) return a.message("info", "the language server doesn't format this");
        if (!r.result.length) return a.message("info", `formatted already (${r.server})`);
        a.languages.applyWorkspaceEdit({ changes: { [pathToFileURL(v.buf.abs).href]: r.result } });
        a.message("info", `formatted by ${r.server}`);
      }),
  };
}

/** A hover's contents as markdown: markup, a marked string, or several. */
function hoverText(h: Hover): string {
  const one = (c: MarkupContent | MarkedString): string =>
    typeof c === "string" ? c : "kind" in c ? c.value : `\`\`\`${c.language}\n${c.value}\n\`\`\``;
  return Array.isArray(h.contents) ? h.contents.map(one).join("\n\n") : one(h.contents);
}

/** Locations a server gives, as files and positions (a `LocationLink`'s target). */
/**
 * A jump the file's language server answers (19.13): one place, gone to; several, a list to pick
 * from. `what`: the answer's name, one and many.
 */
async function goTo(
  a: App,
  v: View,
  method: string,
  capability: string,
  feature: Feature,
  what: [string, string],
): Promise<void> {
  a.languages.sync(v.buf);
  const s = a.languages.servers;
  if (!s?.isOpen(v.buf.abs))
    return a.message("info", "no language server for this file (slipbox doctor says which it would have)");
  if (!(await s.offers(v.buf.abs, feature, capability)))
    return a.message("info", `the language server doesn't find ${what[1]}`);
  const answer = await s.request<Location | Location[] | LocationLink[]>(
    v.buf.abs,
    method,
    { textDocument: { uri: pathToFileURL(v.buf.abs).href }, position: a.languages.position(v) },
    capability,
    feature,
  );
  const locs = answer ? locations(answer.result) : [];
  if (!locs.length) return a.message("info", `no ${what[0]} found here`);
  if (locs.length === 1) return a.languages.openLocation(locs[0]!.path, locs[0]!.line, locs[0]!.character);
  pickLocation(a, `${locs.length} ${what[1]}`, locs);
}

function locations(
  r: Location | Location[] | LocationLink[] | null,
): { path: string; line: number; character: number }[] {
  const list = r === null ? [] : Array.isArray(r) ? r : [r];
  return list.flatMap((l) => {
    const uri = "targetUri" in l ? l.targetUri : l.uri;
    const range = "targetSelectionRange" in l ? l.targetSelectionRange : l.range;
    return uri.startsWith("file:")
      ? [{ path: fileURLToPath(uri), line: range.start.line, character: range.start.character }]
      : [];
  });
}

/** Several locations: a list to pick from, each its file and line, its text there. */
function pickLocation(a: App, title: string, locs: { path: string; line: number; character: number }[]): void {
  const shown = (p: string) => (p.startsWith(`${a.loc.root}/`) ? p.slice(a.loc.root.length + 1) : p);
  a.overlays.openList({
    title,
    items: locs.map((l) => ({ label: `${shown(l.path)}:${l.line + 1}`, detail: lineOf(l.path, l.line), data: l })),
    accept: (item) => {
      const l = item.data as { path: string; line: number; character: number };
      a.languages.openLocation(l.path, l.line, l.character);
    },
  });
}

/** A file's line, trimmed (for a list of locations); empty when it can't be read. */
function lineOf(path: string, line: number): string {
  try {
    return (readFileSync(path, "utf8").split("\n")[line] ?? "").trim();
  } catch {
    return "";
  }
}

/** The text a range of the protocol's covers (lines and UTF-16 characters, from 0). */
function textIn(source: string, starts: number[], r: Range): string {
  const at = (p: Range["start"]) => (starts[p.line] ?? source.length) + p.character;
  return source.slice(at(r.start), at(r.end));
}

/** A code action carried out: resolved first when it came without its edit, its edit made, then its command run. */
async function runAction(
  a: App,
  path: string,
  chosen: { action: CodeAction | LspCommand; server: string },
): Promise<void> {
  const s = a.languages.servers!;
  let action = chosen.action;
  if (!("command" in action && typeof action.command === "string")) {
    const ca = action as CodeAction;
    if (!ca.edit && !ca.command)
      action = (await s.requestOf<CodeAction>(path, chosen.server, "codeAction/resolve", ca)) ?? ca;
  }
  const command =
    typeof (action as LspCommand).command === "string" ? (action as LspCommand) : (action as CodeAction).command;
  const edit = "edit" in action ? (action as CodeAction).edit : undefined;
  if (edit) a.languages.applyWorkspaceEdit(edit);
  // The server has the text the edit made before it runs a command on it.
  const buf = a.view?.buf;
  if (buf) a.languages.sync(buf);
  // Its command is the server's to run; an edit it asks for then comes back as workspace/applyEdit.
  if (command)
    await s.requestOf(path, chosen.server, "workspace/executeCommand", {
      command: command.command,
      arguments: command.arguments,
    });
  a.message("info", action.title);
  a.host.requestRender();
}
