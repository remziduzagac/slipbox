// The CLI's presentation: help, safe JSON envelopes, terminal streams and exit policy.
// Dispatch and argument admission stay in cli.ts; handlers share common.ts's Session and Result.

import { sanitize, UNSAFE } from "../core/foundation/text/sanitize.ts";
import { VaultError } from "../core/workspace/vaults/vault.ts";
import { VERSION } from "../version.ts";
import { UsageError } from "./args.ts";
import { EXIT, CliError, type Io, type Result, type Session } from "./common.ts";

/**
 * JSON with every character `sanitize` would change escaped as \uXXXX. JSON.stringify leaves C1
 * controls, DEL and bidi overrides raw, and a terminal acts on them. Lossless: it is still the same
 * JSON value.
 */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    new RegExp(UNSAFE.source, "g"),
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export const JSON_SCHEMA = 1;

export const HELP = `slipbox ${VERSION} — read, review and edit what your coding agent writes, in your terminal

Usage:
  slipbox [path]                    open the TUI (needs a terminal); also: slipbox open [path]
  slipbox render <note>             render a note to stdout        [--width N] [--theme T] [--glyphs G] [--plain]
  slipbox resolve <link>            follow a link to a path        [--from <note>]
  slipbox link <note>               a link to it, as slipbox writes one here: the folder's convention  [--from <note>]
                                    [--text T] [--style markdown|wiki] [--embed]
  slipbox links <note>              outgoing links with status     [--all: every note's]
  slipbox backlinks <note>          notes that link to <note>
  slipbox search <words…>           notes ranked by the words: "phrases", prefix*, -not, title:, #tag, path:  [--scope here|linked|all]
                                    [--limit N]
  slipbox index                     build or bring up to date the search index here  [--rebuild]
  slipbox index --home              the background auto-index of the home folder, run now  [--budget MS] [--rebuild]
  slipbox index --refresh [path]    bring a vault's index up to date now — this one, or the one holding path
  slipbox changed                   what this branch changed against the base (main), committed or not  [--base <ref>]
  slipbox diff <note>               the note's changes on this branch: against where it left the base  [--base <ref>]
  slipbox merge-review <branch>     the links merging <branch> here would break, from git's tentative result  [--into <ref>]
  slipbox worktrees                 the repository's checkouts: the main one and its worktrees, by branch
  slipbox context <note>…           the notes, what they link to and what links to them, as one document for an agent
                                    [--depth N] [--no-backlinks] [--limit N] [--copy]
  slipbox tags [tag]                the tags here and how many notes carry each; a tag's notes
  slipbox problems                  broken, ambiguous and fragile links here, and notes nothing links to  [--lint]
  slipbox ls                        list the notes here            [--files: data and text files too]
  slipbox outline <note>            headings with source lines
  slipbox footnotes <note>          footnotes: each label, its text and line, and where it's referred to
                                    [add <line[:col]> <text> | edit <label> <text> | rm <label> | rename <label> <new>] [--if-unchanged <sha>]
  slipbox find <query> [note]       find text in a note, or every note  [--regex] [--whole] [--ignore-case] [--files]
  slipbox replace <note> <old> <new>  replace in a note  [--regex] [--whole] [--ignore-case] [--first | --first-per-line] [--lines A-B] [--dry-run] [--if-unchanged <sha>]
  slipbox replace --all <old> <new>  replace in every note, undone as a rename is  [--files] [--regex] [--whole] [--ignore-case] [--dry-run] [--plan]
  slipbox spell <note>              the words its dictionaries don't know (its lang:, else [spell] languages)
                                    [--lang L[,M]] [--suggest] · --add <word>: one of your words, added
  slipbox task <note> [line]        list tasks, or toggle one      [--check] [--uncheck] [--if-unchanged <sha>]
  slipbox read <note>               a note's text, and its sha
  slipbox stat <note>               a note's size, dates, title, counts, encoding (the TUI's note info)
  slipbox write <note> [text]       write a note (atomic, in the vault)  [--stdin] [--append [--paragraph]] [--create] [--if-unchanged <sha>] [--allow-empty]
  slipbox mkdir <path>              make a folder here (and its parents)
  slipbox mv <note|folder> <new-path>  rename or move a note or folder; links fixed wherever they're reached  [--dry-run] [--plan]
                                    <new-path> (and cp's path): from the vault's top, or from here when ./ or ../, or absolute;
                                    a folder that's there, or a path ending in /, is moved or copied into (its name kept)
  slipbox cp <note|folder> [path]   copy a note or folder (beside it, as name-copy, when no path)
  slipbox rm <note|folder>          delete to the trash (slipbox trash restore puts it back)  [--dry-run]
  slipbox trash [restore <item>]    what's in the trash, newest first; restore an item (its id or path)
  slipbox trash empty               what's in the trash, listed; removed for good with --yes (it keeps 30 days)  [--yes]
  slipbox name <new>                this folder's name, as a pointer names it: changed, the old kept; a repository given one
                                    [--dry-run] [--plan]
  slipbox vaults                    known vaults and saved home workspaces, newest first
  slipbox folders [default <name> <path>]  the named folders: their copies, the one links open; or make one the one
  slipbox symlinks [forget <link>]  the symlinks you've answered, followed or not, and where they lead; or forget one:
                                    asked again in slipbox, and followed no more
  slipbox rename-heading <note> <heading> <new>  rename a heading; links to it fixed everywhere  [--dry-run] [--plan]
  slipbox relink [note]             rewrite links broken by a move slipbox saw, to where the file is  [--dry-run] [--plan]
  slipbox convert-links [note]      wikilinks and links from the vault's top rewritten as relative paths  [--dry-run] [--plan]
  slipbox undo                      take back the last mv, name, rename-heading, relink, convert-links or replace --all here
                                    [--dry-run] [--plan]
  slipbox apply [plan]              write a plan --plan saved (refused if a file changed since); none: those waiting  [--dry-run]
  slipbox send <note>               open it in a running editor   [--line N] [--server <socket>]
  slipbox history                   notes read lately, newest first, and what's open
  slipbox export <note…>            notes as one document, beside the first by its name  [--to docx|pdf|html|epub|md] [--out|-o <path>]
                                    [--force: over a file there that isn't an earlier export]
  slipbox capture [text]            append to the scratch          [--ref path:L[-M] | path:L:C-D | path:L:C-M:D] [--snippet] [--stdin] [--lang L]
  slipbox scratch show|path|clear|copy                            [--if-unchanged <sha>]
  slipbox init [dir]                give <dir> a .slipbox/: settings, and a name with --name  [--name N] [--private] [--dry-run] [--plan]
  slipbox deinit <dir>              take a nested vault's .slipbox/ away: part of the vault holding it  [--dry-run] [--plan]
  slipbox info                      the vault, its name and copies, its link convention, paths, versions, staleness
  slipbox doctor [file]             language servers and linters: each language's, found where, installed when needed, or missing
  slipbox diagnostics <file>        a file's problems: its servers', its linters', its syntax; a note's links and lint  [--severity S] [--timeout SECS]
  slipbox themes                    list themes
  slipbox types [type]              document types here (skill, adr, your [types]): how many notes each; a type's notes in order
  slipbox upgrade                   the latest release installed, checked before it's used  [--check: only say whether there's one] [--no-skill]
  slipbox channel [set stable|preview]  which releases the installer's install follows: stable, or previews too
  slipbox uninstall                 what the installer put here, listed; removed with --yes  [--purge: slipbox's folders too] [--yes]
  slipbox report                    what a bug report asks for (the version, how it was installed, the system, the
                                    terminal) and the bug form's address filled in with it; nothing sent
  slipbox skill                     the skill for agents: printed; --auto detects agents; --install <dir> writes into <dir>/slipbox/
                                    [--install <dir>] [--force: over a file slipbox didn't write, or a link] [--dry-run]
  slipbox commands                  list named commands and their CLI equivalents

Global options:
  --root <dir>      the vault to start from (default: the nearest folder above the path or cwd holding a vault marker)
  --config <file>   user config file (default: $SLIPBOX_CONFIG or ~/.config/slipbox/config.toml)
  --json            one JSON object on stdout: {schema, ok, command, data, warnings, stale}
  --color <when>    auto | always | never
  -h, --help        this help        -V, --version   print the version

<note> is a path (a data or text file too, with its extension), a named folder's file by its pointer
(slipbox://research/algorithms/dijkstra.md, the name as slipbox folders shows it), or a note's name (its file's,
or an alias); a name several notes share is exit 4,
unless --from <note> picks the one a link from there reaches. resolve <link> --from <note> gives
href, the relative path a link there carries. After --, nothing is an option:
slipbox read -- -dash.md names a note that starts with a dash.
Exit codes: 0 ok, 1 error, 2 usage, 3 not found, 4 ambiguous (a link; several nvims for send),
5 refused (--if-unchanged, a write outside the vault or over an existing note, invalid UTF-8,
  a link not followed, an index asked of Elsewhere).
`;

type OutputSession = Pick<Session, "stale" | "allWarnings">;

export class CliOutput {
  constructor(
    private readonly io: Io,
    private readonly json: boolean,
  ) {}

  // `--json` promises exactly one object on stdout, whatever happens: usage errors included.
  private envelope(o: {
    ok: boolean;
    command: string;
    data?: unknown;
    error?: { code: number; message: string };
    warnings?: string[];
    stale?: string[];
  }): string {
    return `${safeJson({ schema: JSON_SCHEMA, ok: o.ok, command: o.command, ...(o.error ? { error: o.error } : {}), data: o.data ?? null, warnings: o.warnings ?? [], stale: o.stale ?? [] })}\n`;
  }

  usageError(command: string, message: string): number {
    if (this.json) this.io.out(this.envelope({ ok: false, command, error: { code: EXIT.usage, message } }));
    else this.io.err(sanitize(`slipbox: ${message}\n`));
    return EXIT.usage;
  }

  version(): number {
    this.io.out(
      this.json ? this.envelope({ ok: true, command: "version", data: { version: VERSION } }) : `slipbox ${VERSION}\n`,
    );
    return EXIT.ok;
  }

  help(): number {
    this.io.out(this.json ? this.envelope({ ok: true, command: "help", data: { text: HELP } }) : HELP);
    return EXIT.ok;
  }

  report(command: string, r: Result): number {
    this.io.out(this.json ? this.envelope({ ok: true, command, data: r.data }) : sanitize(r.human ?? ""));
    return EXIT.ok;
  }

  result(command: string, result: Result, session: OutputSession): number {
    const stale = command === "init" ? [] : session.stale();
    if (this.json) {
      this.io.out(
        `${safeJson({ schema: JSON_SCHEMA, ok: true, command, data: result.data, warnings: session.allWarnings(), stale: stale.map((s) => s.path) })}\n`,
      );
    } else {
      // Note text reaches the terminal only sanitized (2.9). `render` is the exception: its output
      // is a layout, sanitized when built, plus the colours it adds on purpose.
      if (result.human) this.io.out(command === "render" ? result.human : sanitize(result.human));
      // Diagnostics quote config values and paths from the vault: sanitized like the output (2.9).
      for (const w of session.allWarnings()) this.io.err(sanitize(`slipbox: warning: ${w}\n`));
      if (stale.length)
        this.io.err(
          sanitize(`slipbox: warning: unsaved changes in a running slipbox: ${stale.map((s) => s.path).join(", ")}\n`),
        );
    }
    return result.code ?? EXIT.ok;
  }

  error(command: string, err: unknown, session: OutputSession | null): number {
    const code =
      err instanceof CliError
        ? err.code
        : err instanceof UsageError
          ? EXIT.usage
          : err instanceof VaultError
            ? EXIT.notFound
            : EXIT.error;
    const message = (err as Error).message;
    if (this.json) {
      let stale: string[] = [];
      try {
        stale = session && command !== "init" ? session.stale().map((x) => x.path) : [];
      } catch {
        // the error came from the session itself; no stale list then
      }
      this.io.out(
        this.envelope({
          ok: false,
          command,
          error: { code, message },
          data: err instanceof CliError ? (err.data ?? null) : null,
          warnings: session?.allWarnings() ?? [],
          stale,
        }),
      );
    } else {
      this.io.err(sanitize(`slipbox: ${message}\n`));
      if (
        !(err instanceof CliError) &&
        !(err instanceof UsageError) &&
        !(err instanceof VaultError) &&
        this.io.env.SLIPBOX_DEBUG
      )
        this.io.err(`${(err as Error).stack}\n`);
    }
    return code;
  }
}

export function defaultIo(): Io {
  return {
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
    // Strict: invalid UTF-8 would be written as U+FFFD, the bytes lost without a word.
    stdin: async () => {
      const bytes = new Uint8Array(await new Response(Bun.stdin.stream()).arrayBuffer());
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new CliError("stdin isn't valid UTF-8; nothing written", EXIT.refused);
      }
    },
    isTTY: !!process.stdout.isTTY,
    columns: process.stdout.columns,
    rows: process.stdout.rows,
    cwd: process.cwd(),
    env: process.env,
  };
}
