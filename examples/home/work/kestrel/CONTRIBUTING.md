# Contributing to Kestrel

Thanks for helping. This page is the short version; the long one is [the developer setup](docs/dev-setup.md).

## Getting set up

1. Fork and clone the repository. The docs live in the same repository as the code, so one clone is enough.
2. Follow [docs/dev-setup.md](docs/dev-setup.md) for tools and the local stack (`docker compose up`).
3. Copy `.env.example` to `.env` and fill in the placeholders.
4. Run `make test`. If it passes on a clean checkout you are ready.

## Branches and commits

Branch names say what the change is: `feature/<name>`, `fix/<name>`, `docs/<name>`, `cleanup/<name>`. Agents and
people working on the same issue use their own prefix, for example `agent/sync-retry` or `jo/release-notes-wording`.

Commit subjects are in the imperative, at most 72 characters, with no trailing full stop:

```text
Sync: park rejected ops instead of retrying forever
Docs: move the sharing doc under features/
Fix route names cut inside a grapheme
```

Body text explains why, wrapped at 72. Reference an issue as `Refs #123`, or `Fixes #123` to close it.

## Pull requests

- One topic per pull request. A rename and a rewrite of the same file are two commits, so the history shows the move.
- CI must pass: lint, tests on the matrix and the build. See `.github/workflows/ci.yml`.
- A change to behaviour changes the docs in the same pull request, and a line in `CHANGELOG.md` under
  `Unreleased`.
- Ask for review from the code owner of the area (`CODEOWNERS`); Priya Nair triages anything unowned.

## The docs convention

Documents in `docs/` are plain Markdown that GitHub renders, and they link to each other the way GitHub does:

- **Relative links** between documents in the same area: `[sync](../sync.md)` from `docs/adr/`.
- **A leading `/`** for a link from the repository's root, when the document is deep and the target is far:
  [the deploy runbook](/docs/runbooks/deploy.md). GitHub resolves it against the repository, not the disk.
- Always keep the `.md` extension; the docs site and GitHub both need it.
- Headings are the anchors. Do not add `<a name>` tags, and do not rename a heading without searching for links to it.
- Wrap at 120 columns. Tables and code too.

When you move a document, use `git mv` in its own commit and fix every link in the same pull request; reviewers check
the diff for links that point at the old path.

## Reporting a problem

Open an issue with the version (from the footer of the app, or `kestrel --version`), what you did and what you
expected. For security problems write to security@kestrel.dev instead of opening an issue.

## License

By contributing you agree that your contribution is licensed under the [MIT license](LICENSE).
