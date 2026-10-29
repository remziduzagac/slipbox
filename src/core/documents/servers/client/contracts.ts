// Language-client configuration, state and callbacks; lifecycle remains in the client.

import type { Diagnostic, WorkspaceEdit } from "vscode-languageserver-protocol/node";

/** How to start a server, and what to tell it. */
export interface ServerSpec {
  /** Its name, as the config and the messages say it. */
  name: string;
  /** The program and its arguments. */
  argv: string[];
  /** Added to the environment it runs in. */
  env?: Record<string, string>;
  /** Its settings: what `workspace/configuration` asks for, and `didChangeConfiguration` sends. */
  settings?: Record<string, unknown>;
  /** Sent with `initialize`, for servers that read their options there. */
  initOptions?: unknown;
  /** The project's top folder (absolute): its workspace. */
  root: string;
  /** How long every request waits for its answer (`slipbox diagnostics --timeout`); else REQUEST_DEADLINE_MS, and
   *  PULL_DEADLINE_MS for a pull. */
  timeoutMs?: number;
}

export type ClientState = "starting" | "running" | "stopping" | "stopped" | "failed";

export interface ClientHooks {
  /** A document's diagnostics, as the server has them now (sent or asked for). */
  diagnostics?: (uri: string, diagnostics: Diagnostic[], version: number | null) => void;
  /** What the server says for the user's log. */
  log?: (message: string) => void;
  /** What the user should know of the client's limits: a request not answered in time, the requests waiting their
   *  turn, an answer's diagnostics left out — each said once while the server runs. */
  notice?: (message: string) => void;
  /** It ended after it was running: asked to (`expected`), it crashed, or slipbox stopped it (`stoppedByClient`: what
   *  it sent couldn't be read); a start that fails rejects start() instead. */
  exited?: (expected: boolean, why: string, stoppedByClient?: boolean) => void;
  /** An edit it asks slipbox to make (after a command it was told to run): true when it was. */
  applyEdit?: (edit: WorkspaceEdit) => boolean;
}
