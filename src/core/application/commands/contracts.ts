// Independent command metadata: area catalogs depend on this contract, never on their composer.

export interface CommandSpec {
  id: string;
  title: string;
  /** CLI invocation reaching the same state change, or null for a TUI-only interaction. */
  cli: string | null;
  /** A short explanation, shown under the entry in the which-key popup and in the palette. */
  desc: string;
  /**
   * The ids it had before (D274): still taken wherever a command is named — `[keys]`, `[aliases]`, a run by id — and
   * read as this one, never listed.
   */
  formerly?: string[];
}
