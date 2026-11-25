---
status: current
created: "2026-11-25"
---

# Research: how editors open a file outside the project open

What an editor does when you open a file that lies outside the project, folder, workspace or vault open: by which
routes, where it opens, what works for it, what it warns about, and whether its folder joins. Asked before
[OUT](../workstreams/outside-files/README.md) decided how slipbox opens a file outside the vault (OUT-D1–OUT-D3).

Provenance: every page was fetched on 2026-11-25 through a tool that summarises it, so *summary* marks what that
summary said, a quoted phrase included, never the whole page read; *search* marks what only a search result's snippet
said; *memory* marks what comes from memory, unchecked. A forum post is not the vendor's word unless it says so.

## VS Code

- **Opens it, asking about trust.** "If you open a file that is located outside of a trusted folder, VS Code detects
  that the file comes from somewhere outside the folder root and prompts you with the option to continue to open the
  file or open the file in a new window in Restricted Mode." *summary*:
  <https://code.visualstudio.com/docs/editing/workspaces/workspace-trust> (dated 11/25/2026 in its footer, no
  version).
- **A setting for it.** `security.workspace.trust.untrustedFiles` "controls how to handle loose files in a
  workspace", prompting by default; `open` opens normally, `newWindow` always opens a new Restricted Mode window.
  *summary*: the same page.
- **No folder open.** An empty window runs with full trust, and opening a file asks whether to open an untrusted one,
  "since there is no folder to parent it". *summary*: the same page.
- **What Restricted Mode keeps.** "Text editing is always supported"; extensions that haven't opted in are disabled,
  and tasks, debugging and the terminal are blocked, as the page says for a folder in Restricted Mode. Whether all of
  that applies to a single file in such a window: not on the page. *summary*: the same page.
- **Routes.** `code file`; `-r` reuses the last active window, `-n` opens a new one. *summary*:
  <https://code.visualstudio.com/docs/configure/command-line>. Which window a plain `code file` picks by default: not
  found; the same window is *memory*. Search, the file tree, language servers and git for an outside file: not found.

## Zed

- **The existing window by default.** With `existing_window`, "files outside any open project can also open in an
  existing window"; with `new_window`, an unrelated file opens in a new window. `-n`, `-e` and `-a` (add to the
  project) on the command line. *summary*: <https://zed.dev/docs/reference/cli>,
  <https://zed.dev/docs/windows-and-projects> (undated).
- **Its own trust.** A file alone is a "single file worktree", and "each single file worktree requires a separate
  trust grant, unless the directory containing it is trusted"; Restricted Mode shows in the title bar. *summary*:
  <https://zed.dev/docs/worktree-trust> (undated).
- What works and what is lost for such a file: not found.

## IntelliJ IDEA

- **The full IDE, after a trust dialog** (2026.3): "files open in the full IDE by default and go through the file
  security workflow. LightEdit mode is no longer available." The dialog offers Safe Mode (code execution, builds and
  scripts restricted) or Trust File. *summary*: <https://www.jetbrains.com/help/idea/project-security.html> (2026.3,
  November 2026; the page's text says "2063.3", read as a typo).
- **Before:** LightEdit (2024.2), a light editor without a project, `idea -e file`: editing, but no completion or
  navigation, and "Open file in project" to join one. *summary*:
  <https://www.jetbrains.com/help/idea/2024.2/lightedit-mode.html>. A 2026.1 snippet still describing LightEdit
  contradicts 2026.3: *search*, not opened; 2026.3 taken as current.
- Which window when a project is open, and what is lost: not found.

## Sublime Text

- **The project's window.** A file outside the project opens in its window; `open_files_in_new_window` (`never`,
  `always`, `finder_only`) sends every file to a new window or none, "it doesn't check, whether it belongs to a
  project". *summary*, a forum answer, not the vendor's, 2023-08-07:
  <https://forum.sublimetext.com/t/forbid-st-from-opening-non-project-files-in-the-projects-window/68989>.
- **Left out of the project's search.** Goto Anything and project-wide search use the sidebar's folders: *search*,
  forum snippets, not opened. No warning found. Docs undated (build 4131 in `subl --help`,
  <https://www.sublimetext.com/docs/command_line.html>).

## Helix

- Workspace trust is per workspace, gating local config, debug adapters and git, and language servers only at level
  `none`; files outside any workspace are "not covered". *summary*:
  <https://docs.helix-editor.com/master/workspace-trust.html> (undated). Routes and what opens where: not found.

## Neovim

- **No project.** Any file opens in the same editor and working folder; `autochdir`, off by default, moves the folder to
  the file's. `v:oldfiles` and sessions remember files. No warning. *summary*: <https://neovim.io/doc/user/starting/>,
  <https://neovim.io/doc/user/options/> (generated 2026-11-25). Project plugins: not researched.

## Emacs (project.el)

- **The project follows the file.** "The current project is determined by the `default-directory`" of the buffer;
  outside a recognisable project, project commands "prompt you for the project directory". No warning; nothing joins.
  *summary*: a mirror of the GNU manual (Emacs 31.1, modified 2026-09-10),
  <https://www.southampton.ac.uk/~qs2g22/mirror/info/emacs-31.1/Project-File-Commands.html>; gnu.org didn't load.

## Obsidian

- **Refused until recently.** Before desktop 1.14.2, opening a file outside the vault from the system was ignored, and
  "Obsidian doesn't work on individual files directly". *summary*, forum posts, not the vendor's, June 2026:
  <https://forum.obsidian.md/t/macos-tahoe-26-5-1-obsidian-1-12-7-external-file-opening-is-ignored/115681>.
- **Now in the current window.** 1.14.2 (2026-09-15) adds "Open file from outside the vault…" ("Pick any file on your
  computer and view it in the app"), the system's "Open with", and Obsidian as the default app for Markdown, on the
  desktop: "The file opens in your current window." *summary*:
  <https://obsidian.md/changelog/2026-09-15-desktop-v1.14.2/>. It replaces the current tab, and opening it in a new tab
  is asked for, planned for 1.15.0: *summary*, forum posts, not the vendor's, October 2026:
  <https://forum.obsidian.md/t/open-out-of-vault-files-in-a-new-tab/119347>.
- Editing and saving such a file, its links, a banner, recent files: not found. Another folder is another vault.

## Logseq

- A Markdown file outside the graph can't be opened; a `file:///` link to one opens on macOS. *summary*, forum posts,
  not the vendor's, 2021 and 2022: <https://discuss.logseq.com/t/open-local-files-outside-the-graph-through-uri/1452>.
  No official docs found.

## What they share

- The code editors open the file where you are and limit what runs, not what opens: VS Code, Zed and IntelliJ ask
  about trust, Helix gates by workspace, Sublime and Neovim ask nothing.
- The file stays outside: its folder doesn't join the project unless asked (`zed -a`), and Sublime's project search
  leaves it out (*search*).
- Where windows exist, a new one is a choice (VS Code's `newWindow`, Zed's `new_window`); without them (Neovim,
  Emacs) the file just opens.
- The vault-shaped note apps were the strictest: Logseq refuses, and Obsidian refused until September 2026, then opened
  such a file in the current window.

Coverage: searched 2026-11-25, through page summaries: VS Code's docs, Zed's, JetBrains' help (2026.3 and 2024.2),
Sublime's docs and forum, Helix's and Neovim's docs, a mirror of Emacs's manual, Obsidian's changelog and forum,
Logseq's forum. Not searched: the editors' issue trackers, Neovim's project plugins, Kate and the long tail; no editor
was tried by hand. Unverified: which window VS Code picks for a plain `code file`, and what VS Code, Zed and Obsidian
turn off for an outside file.
