# Decisions

What was agreed, and why: every root decision, D1 onward, with its reasons, what it cost, what was not chosen, and the
dated notes later decisions left under it. Requirements and design say what holds now; these say how it came to.

- [foundations.md](foundations.md) (D1–D37): what slipbox is, the stack, one core and its faces, the principles, the
  phases, the agent surface.
- [roots-and-links.md](roots-and-links.md) (D38–D87): the vault root and the vaults of 2026-09-30, plain paths and
  virtual vaults, then paths inside and conventions at the edges; storage, the walk, links, tags, worktrees.
- [reading.md](reading.md) (D88–D133): rendering, themes, keys and modes, images, files beyond markdown, embeds,
  search, big notes, code as a notebook, document types.
- [editing.md](editing.md) (D134–D158): the editor and the hand-off, concurrent edits, write safety, renames, the
  explorer, git, editing fundamentals.
- [code-intelligence.md](code-intelligence.md) (D159–D177): language servers and linters, diagnostics, trust.
- [export.md](export.md) (D178–D190): notes as documents, in formats slipbox writes itself.
- [distribution.md](distribution.md) (D191–D205): platforms, releases, updates, licences, the supply chain.
- [process.md](process.md) (D206–D210, and later ones): how the work is done and recorded, and the blueprint itself.

## Rules

- **Append-only.** An entry is never rewritten. A later decision that changes it is a new entry naming the earlier
  one, and a dated note goes in a blockquote under the earlier entry's heading: Superseded, Amended, Detailed,
  Clarified or Corrected by `<ID>`, or Verified. An entry with no Superseded note is in force.
- **Titles carry the plan item** a decision answers, where it has one, and the date it was agreed:
  `## D39: Config, cache and state apart; nothing derived in the vault (0.10, 2026-09-25)`. To find the decisions
  behind a roadmap step, search the titles: `grep -n '(0.10[,)]' blueprint/decisions/*.md`.
- **Fields:** `**Decision:**`, `**Why:**`, and when they apply `**Cost:**`, `**Not chosen:**` (pointing at ideas.md)
  and `**Verify:**`. A Verify line is a check still owed until a Verified note answers it.
- **New root decisions** take the next number and go at the end of the file of their theme; a new theme gets a new
  file, added above. Since the initial design was settled (D210), a change to requirements or design is decided
  inside its workstream, numbered with the workstream's key (`WG-D1`); root decisions are for what belongs to no
  workstream.
- **Where they came from.** These entries were converted on 2026-10-11 from `docs/idea.md`, `docs/plan.md`,
  `docs/handoff.md` and `docs/design/decisions.md` (D210), keeping their wording where it moved. Their dates are the
  sources' own; where a source gave none, the date of the commit that recorded the decision.

## Renamed terms

Older entries use the words of their day. Read them as:

- **vault** → a **root** (the nearest folder holding `.git`, `.slipbox/`, `.obsidian/` or `.zk/`: D69) or a **named
  folder** (one a pointer names: D74). Until 2026-10-02 a vault was a folder with `.slipbox/` (D38, D42); from
  2026-10-02 to 2026-10-05 a virtual vault was the nearest `.slipbox/` or git checkout (D58). Vaults stopped being a
  concept on 2026-10-05 (D79).
- **home vault**, **single-file mode** → gone; a **plain folder** stands in (D58).
- **`[[vault:note]]`**, **`vault:path`** → a **pointer**, `slipbox://name/path` (D75), in files; a path on screen
  (D77).
- **collection**, **instance** → gone; a named folder has **copies** (D74).
- **scope** (D55, never built) → the root.
- **`slipbox vaults`** → `slipbox folders`; **`rename-vault`** → `slipbox name`; **`--scope vault`** →
  `--scope here` (D79).
- **the LSP face**, `slipbox lsp` → removed (D67); the language-server **client** for code stays (D161).
- **Scout** → **trailscout**, its own project (D124).
- **the plan**, a **decide item**, a **constraint item** → the roadmap and its step IDs; a decide item's answer is a
  decision here, a constraint item is in requirements.md § Constraints.
- Still named "vault" in code and config: `core/vault.ts`, the `[vault]` identity table in `.slipbox/config.toml`,
  command ids such as `vault.init`; the colour role `sidebar_vault` is `sidebar_root` now, the old name still read
  (DF-D22).
