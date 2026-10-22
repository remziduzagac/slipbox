# Versions, updates and compatibility

<a id="versions"></a>

A slipbox version says what changed since the one before. It also says which changes can break a script, an agent or
your settings.

This chapter covers:

- what slipbox promises to keep
- what each part of a version number means, before 1.0 and after it
- what previews are
- how something is retired
- where to read what changed before you upgrade

## Which version you have

`slipbox --version` prints it: `slipbox 0.2.0`. With `--json`, it's `data.version`. `slipbox info` says it too, and
whether this is a release or slipbox run from its source.

A version is three numbers: major, minor and patch. `0.2.0` is major 0, minor 2, patch 0.

Each release has a version of its own, never used again. A release once published is never changed. A preview's version
says more ([Previews](#previews)).

## What a version promises

### What is kept

Scripts, agents and your own files rely on these. So they change only as
[What each part of a version means](#what-each-part-of-a-version-means) says:

- **The command line:** each command, its arguments and its flags, and what it does ([The command line](cli.md)).
- **`--json`:** the object every command prints (`schema`, `ok`, `command`, `error`, `data`, `warnings`, `stale`).
  Also the `data` of the stable commands, whose version is `schema` ([What stays stable](cli.md#what-stays-stable)).
- **The exit codes**, 0 to 5 ([Exit codes](cli.md#exit-codes)).
- **The settings** ([Configuration](configuration.md)):
  - the keys of your config file and of a folder's `.slipbox/config.toml`, their values and what they do
  - the names of the commands your keys and aliases call
  - slipbox's own environment variables
- **What slipbox writes into your files:** the links it writes, and the `.slipbox/` folder. The links are Markdown
  links, wikilinks and `slipbox://` pointers, in [Links and backlinks](links-and-vaults.md)'s forms.

### What may change in any release

- **The TUI:** how it looks, its layout, its messages, and its default keys. Your own key bindings stay yours.
- **The human output of a command**, which is for people. A script reads `--json` instead.
- **The files in slipbox's own folders,** and how they're laid out ([Where slipbox keeps
  things](configuration.md#where-slipbox-keeps-things)). A script asks for what's in them through a command, such as
  `slipbox scratch show` or `slipbox trash`. It never reads or writes them itself.
- **slipbox's source code**, which isn't a library. Nothing in it is meant to be imported by another program.

## What each part of a version means

### Before 1.0

slipbox is before 1.0 now, while its command line settles.

- **A minor release** (`0.2.0` to `0.3.0`) adds and fixes. It may change what is kept: a command, a flag, a setting.
  Each such change is in the changelog, with what to do.
- **A patch release** (`0.2.0` to `0.2.1`) fixes what's wrong, and changes nothing that is kept.

Some of it is stable already. The exit codes and the `--json` object are stable for every command. The stable
commands' `data` changes only with a new `schema` ([What stays stable](cli.md#what-stays-stable)).

### From 1.0

- **A major release** (`1.4.2` to `2.0.0`) may change what is kept.
- **A minor release** (`1.4.2` to `1.5.0`) adds to it, and breaks nothing.
- **A patch release** (`1.4.2` to `1.4.3`) fixes what's wrong, and changes nothing that is kept.

### The `schema` number

`--json`'s `schema` counts apart from slipbox's version. It starts at 1. It goes up when a stable command's output
changes:

- before 1.0, in a minor release
- from 1.0, only in a major one

A script that checks it learns that the shape it reads has changed, whatever the version says.

## Previews

Between releases, slipbox publishes previews. They're builds of what the next release will hold, for those who want it
before it's released. Each is made as a release is, from code that passed slipbox's checks.

A preview keeps none of the promises above. What it adds may still change, or go, before the release. The changelog
speaks of releases only.

- **Who gets them:** only an install that asks. The installer installs the newest preview with `--preview`, and that
  install follows previews from then on. `slipbox channel set preview` makes an install follow them.
  `slipbox channel set stable` goes back to releases only ([Previews](../guides/install.md#previews)). Homebrew
  installs releases only.
- **How they're numbered:** the version of the release it leads to, then `-preview.`, then when it was made, then the
  commit it was made from. When it was made is the date and time in UTC, to the minute. For example,
  `0.3.0-preview.202610121530.g1a2b3c4` is a preview of 0.3.0. It was made on 12 October 2026 at 15:30 UTC, from
  commit `1a2b3c4`.
- **How they sort:** a preview comes after the previews before it, and before the release of its version. Following
  previews, `slipbox upgrade` moves from one preview to the next, and to the release once it's out.
- **Where they are:** on the releases page, marked as pre-releases. Each is tagged `preview-<time>-<commit>`
  (`preview-202610121530-1a2b3c4`).

## How something is retired

A command, a flag or a setting that is to be renamed or removed is deprecated first, before 1.0 and after it:

- **The changelog says so** in its Deprecated section, with what to use instead. It does so at least one minor release
  before it goes.
- **It keeps working** while it's deprecated, and slipbox warns when you use it:
  - a setting, among the config's warnings ([Mistakes in a file](customization.md#mistakes-in-a-file))
  - a command or a flag, on stderr, and in `warnings` with `--json`
- **Once it's gone,** a setting is named and ignored, with a warning saying what replaced it, as a retired one is now.
  A command or a flag is a usage error, exit code 2. Its message says what to use instead.

Some changes can't keep the old way working beside the new one, such as a change to a command's behaviour. Such a
change comes in a minor release before 1.0, and a major one after, with notes in the changelog.

## What changed, and upgrading

Read the [changelog](../../CHANGELOG.md) before an upgrade that crosses a minor release before 1.0, or a major one
after. `slipbox upgrade` keeps the version it replaces, so you can go back to it
([Upgrading](../guides/install.md#upgrading)).

The changelog lists every release, newest first. For each, it says what was added, changed, deprecated, removed and
fixed, and any security fix. A breaking change is marked, with what to do about it. A release's notes are its entry in
the changelog.
