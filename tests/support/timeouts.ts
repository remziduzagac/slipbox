// ORG-T12: runner budgets only. Product deadlines, child-process bounds and terminal waits stay with their owners.
export const UNIT_TIMEOUT_MS = 30_000;

export const TEST_BUDGETS = {
  // Dictionary build/hold lifecycle on its worker.
  dictionaryThread: 60_000,
  // Bundle and open the dictionary runtime.
  dictionaryBundle: 60_000,
  // Parse the complete source tree: seconds, and longer on a busy machine.
  sourceInspection: 60_000,
  // Exercise every command in the bundled skill.
  skillIntegration: 180_000,
  // Compile and run the isolated binary with workers.
  compiledBinary: 120_000,
  // Build this host release once in beforeAll.
  releaseBuild: 240_000,
  // Install, update or remove a built release in an isolated home.
  releaseIntegration: 60_000,
  // Restart a server and replay its open documents.
  serverRestart: 60_000,
  // Start three trust-scoped servers sequentially.
  serverTrust: 90_000,
  // Restart crashing servers until the retry policy stops.
  serverCrashLoop: 120_000,
  // Compare generated editing sequences in source and lens modes.
  editingDifferential: 60_000,
  // Draw the tab/border matrix at many widths.
  layoutMatrix: 60_000,
  // Compare source/lens editing cases with nvim.
  nvimDifferential: 60_000,
  // Reload external edits through a tall lens.
  lensReload: 60_000,
  // Parse twelve large notes through the worker queue.
  parseBurst: 60_000,
  // Parse one maximum-size note through one worker.
  maximumNoteParse: 120_000,
  // Start the terminal runner and check its selected/list modes.
  terminalRunner: 60_000,
  // Start a terminal app and verify its process preload.
  terminalPreload: 60_000,
  // The export-reads.test.ts file default, initialized in that file.
  exportReads: 60_000,
  // Existing tighter bound for the deliberately slow syntax-worker reply.
  syntaxWorkerReply: 15_000,
  // Existing tighter bound for the large syntax pass with a live UI.
  syntaxUiPass: 20_000,
} as const;
