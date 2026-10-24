# What is slipbox?

slipbox is a terminal app to read, review and edit what your coding agent writes, and any Markdown and code of
your own. Open the files you already have: notes, project documentation, a repository, an Obsidian vault or a zk
notebook.

You can use it beside a coding agent, or on your own. The full-screen interface is for you; the command line gives
agents and scripts another way to work with the same saved files.

![A note rendered beside the explorer: its properties drawn as a table, its heading, a paragraph with links and a
numbered list](../images/introduction-overview.png)

## Read, then edit where you are

A rendered note looks like a document: headings, tables, links and code blocks have their own presentation. Your
files stay Markdown. The reading cursor follows the text, and the mouse and familiar editor shortcuts work.

When you want to change a part, open the **lens**. That part shows its source while the rest stays rendered.
Switch to **source mode** when you want the whole file as text. Typing is a separate state: you can inspect either
view before starting to type.

The [reading and editing guide](../guides/lens.md) teaches how these fit together.

## Work with files, not an imported collection

slipbox reads and writes your files where they are. A **vault** is the folder that gives a group of files their
link and search context. Repositories, Obsidian vaults and zk notebooks are recognized automatically.

Files are the source of truth. Indexes and rendered results are caches; there is no separate proprietary note
format to export before you can leave. [How slipbox works](how-it-works.md) explains the guarantees and limits.

## Review and share

Use links, search and the outline to find your way. Rename or move notes with their links updated. Read code with
its structure and diagnostics, review Git changes, gather references in the scratch, and export documents.

A coding agent can search and update saved files through the CLI and its bundled skill. Unsaved text in the screen
is not automatically available to CLI commands. The [agent workflow](../guides/agents.md) explains that boundary.

## Start using it

1. [Install slipbox](../guides/install.md).
2. [Try the quick start](../guides/quick-start.md) for a small read/edit/save cycle.
3. Follow [Working with slipbox](../guides/getting-started.md) for a complete first session.

Already know the basics? [Using slipbox](../README.md#using-slipbox) explains each part; the
[reference](../README.md#reference) holds exact keys, commands and settings.
