# Security policy

slipbox reads folders other people made: notes, repositories, vaults. It promises that opening one is safe: nothing a
folder brings runs until you trust it, a change to a folder's notes never lands outside that folder, a folder's settings
can't reach the network or name a program to run, and text in a note can't control your terminal. A way around any of
that is a vulnerability, and this page says how to report it.

## Supported versions

Security fixes go into the latest release only, as a new release. Upgrade with `slipbox upgrade`, or as the [install
guide](docs/guides/install.md#upgrading) says for Homebrew and for slipbox run from its source. Until the first release
is published, the `main` branch is the supported version.

## Reporting a vulnerability

Report it privately, through GitHub's private vulnerability reporting:
<https://github.com/remziduzagac/slipbox/security/advisories/new>. The report is private: only you and the repository's
maintainer see it. Never put a vulnerability's details in a public issue, pull request, discussion or commit.

A useful report holds:

- the version (`slipbox --version`), and how slipbox was installed: the installer, Homebrew, or from source;
- the operating system and the terminal;
- what an attacker can do, and what it takes: a note opened, a folder cloned and opened, a command run, a setting;
- the steps to make it happen, with the smallest note, folder or file that does it;
- what you think the fix is, if you have an idea.

## What happens next

- **Within 14 days** the report is acknowledged, in the report's own thread on GitHub.
- **Within 90 days** of the report there is a fixed release, or a plan for one with its date, and you're told which.
- **Disclosure:** once the fixed release is out, a security advisory is published on GitHub, and the changelog lists the
  fix. It's published within 90 days of the report at the latest, unless you and the maintainer agree on another date.
- **Credit:** the advisory and the changelog name you, as you choose, unless you'd rather not be named.

There is no bug bounty.

## Scope

In scope:

- slipbox's code in this repository: the TUI, the command line, and what they write, run and send;
- its releases: the binaries, `install.sh`, the Homebrew formula, and the workflows that build them;
- the scripts a user runs from the source: `scripts/install-local.sh`.

Not in scope:

- **A folder's own content:** what a note says, or the sites it links to. slipbox's job is to keep such content from
  acting on its own, not to judge it.
- **What you trusted:** a folder you trust runs its own tools, as you allowed; so do the programs you chose in your own
  config (your editor, language servers, linters).
- **Other programs' own flaws:** git, a language server, your terminal, Bun or a dependency. Report those to their
  makers; if slipbox is affected through one, report that here.
- **Attacks that need your account or your machine already,** such as a changed config file of your own.
