// Language-client capability declaration and settings lookup below process lifecycle.

import type { ClientCapabilities } from "vscode-languageserver-protocol/node";

/** The parts of a client's capabilities slipbox uses: what a server may count on. */
export const CLIENT_CAPABILITIES: ClientCapabilities = {
  general: { positionEncodings: ["utf-16"] },
  textDocument: {
    synchronization: { didSave: true, dynamicRegistration: false },
    publishDiagnostics: { relatedInformation: false, versionSupport: true, codeDescriptionSupport: true },
    diagnostic: { dynamicRegistration: true, relatedDocumentSupport: false },
    hover: { contentFormat: ["markdown", "plaintext"] },
    definition: { linkSupport: false },
    references: {},
    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
    rename: { prepareSupport: true },
    codeAction: {
      codeActionLiteralSupport: {
        codeActionKind: {
          valueSet: [
            "",
            "quickfix",
            "refactor",
            "refactor.extract",
            "refactor.inline",
            "refactor.rewrite",
            "source",
            "source.organizeImports",
            "source.fixAll",
          ],
        },
      },
      isPreferredSupport: true,
      disabledSupport: true,
      resolveSupport: { properties: ["edit"] },
    },
    formatting: {},
    completion: {
      completionItem: {
        snippetSupport: true,
        documentationFormat: ["markdown", "plaintext"],
        labelDetailsSupport: true,
      },
      contextSupport: true,
    },
    signatureHelp: {
      signatureInformation: {
        documentationFormat: ["markdown", "plaintext"],
        parameterInformation: { labelOffsetSupport: true },
        activeParameterSupport: true,
      },
    },
  },
  workspace: {
    configuration: true,
    workspaceFolders: true,
    didChangeConfiguration: { dynamicRegistration: false },
    applyEdit: true,
    workspaceEdit: { documentChanges: true },
    symbol: { resolveSupport: { properties: ["location.range"] } },
  },
  window: { workDoneProgress: true },
};

/** A setting looked up by a dotted section (`css`, `python.analysis`); everything for none. */
export function settingAt(settings: Record<string, unknown> | undefined, section: string | undefined): unknown {
  if (!section) return settings ?? null;
  let at: unknown = settings;
  for (const key of section.split(".")) {
    if (!at || typeof at !== "object") return null;
    at = (at as Record<string, unknown>)[key];
  }
  return at ?? null;
}
