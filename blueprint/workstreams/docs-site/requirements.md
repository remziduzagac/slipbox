# Requirements

## Goals

- The docs are a website as well as Markdown: searchable, with a sidebar, on GitHub Pages, built and deployed by
  Actions; `docs/` stays their one source, read on GitHub as it is and kept whole by `tests/docs.test.ts` (DS-D1,
  DS-D2).
- A newcomer starts on a path that fits them: the docs' home sends each kind of reader to their page, a quick start
  has slipbox working in two minutes, the concepts are on one page, and an agent guide lets a person's own agent walk
  them through slipbox (DS-D3).
- The docs read easily: short sentences, one idea each, steps as steps, keys and settings in tables (DS-D4).
- The reference chapters (keys, configuration, the command line) read as plainly, their lists kept whole by the
  tests (DS-D5).

## Non-goals

- Translations. Versioned docs: the site shows `main`'s docs; a release's are its tag's, on GitHub.
- A domain of its own: the site is under the repository's Pages address.

## Builds on

- The docs as DOC wrote them (`docs/`, `tests/docs.test.ts`), and the writing rules in
  workstreams/archive/user-docs/requirements.md § How they are written, which DS-D4 changes.
- The Pages site (design/distribution.md § The Pages site), whose root it shares.
- herdsman's docs, the model (notes.md).

## Acceptance criteria

- `https://remziduzagac.github.io/slipbox/docs/` serves every page of `docs/`, in the docs map's groups and order,
  with search; a page's edit link opens its file in `docs/`; the Pages site's root sends a visitor there.
- CI builds the site on every pull request, and fails on a page that won't build or a link within the site that
  doesn't land; `pages.yml` deploys it with the installer.
- The docs' home has the paths, the install and quick-start buttons, and the agent prompt; the quick start, the
  concepts page and the agent guide exist, linked from the map, checked by `tests/docs.test.ts` like every page.
- Every page follows the writing rules of DS-D4.
- The keys, configuration and command-line chapters' prose follows DS-D4; their tables and the configuration's
  TOML listing stay, every key, default, command and flag in them as the tests check.
- greenrepo's DOC-06 is met: its deviation is gone from `.github/upkeep/deviations.toml`.
- `bun run check` passes.

## Changes

### MODIFIED requirements.md § Documentation

Adds: the docs are also a website on GitHub Pages, built from `docs/` by Starlight, searchable, deployed with the
installer (DS-D1, DS-D2); a home with a path for each reader, a quick start, a concepts page and an agent guide
(DS-D3); the reference chapters written by hand, held whole by the tests (DS-D5). The writing rules (How) become
DS-D4's.

Previously: "slipbox ships user documentation in Markdown in `docs/`" (read on GitHub only; greenrepo's DOC-06 a
deviation, GR-D8), with the writing rules of workstreams/archive/user-docs/requirements.md § How they are written.

## How they are written (DS-D4)

Replacing DOC's rules where they differ; the rest stand (British spelling, keys in the keys chapter's notation,
relative links, no IDs, what slipbox does now).

- **Short sentences, one idea each.** Most under twenty words. A sentence that lists, lists as a list.
- **Lead with what to do.** Steps are a numbered list, each one action and what you see after it.
- **"You", the present tense, plain words.** A term slipbox gives its own meaning is defined on the concepts page and
  linked where it first matters.
- **Tables for what is looked up:** keys, settings, modes. Prose for what is explained.
- **A page opens with one or two sentences** saying what it's for, then a section for each thing a reader wants to do
  or know.
- **Colons only to introduce** a list, an example or a definition; not to chain clauses. Commas and full stops instead
  of semicolons where a sentence can end.
