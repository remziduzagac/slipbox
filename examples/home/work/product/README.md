# Kestrel product

<!-- markdownlint-disable MD013 -->
<p align="center"><img src="assets/share-sheet.png" alt="The Kestrel share sheet on a phone" width="320" height="213"></p>
<!-- markdownlint-enable MD013 -->

Everything the product team decides, writes down and ships lives here: requirements, the roadmap, OKRs, release plans
and what customers told us. The code is in [kestrel](https://github.com/kestrel-labs/kestrel); this repository is the
reasons for it.

## What lives where

| Folder | What it holds | Owner |
| --- | --- | --- |
| `prd/` | Product requirement documents, one per feature | Sam |
| `roadmap/` | The quarter's themes and capacity | Sam, Priya |
| `okrs/` | Objectives and key results, one file per quarter | Priya |
| `releases/` | Release plans and customer-facing notes | Jo |
| `research/` | Interview and survey syntheses | Jo, Tomás |
| `design/` | Component inventory and flow notes (open in Obsidian) | Tomás |
| `handbook/` | How we write, how we review: a vault of its own | everyone |
| `drafts/` | Unpolished notes; move them out once they are read twice | whoever wrote them |

## Writing a PRD

1. Copy the headings of [route sharing](/prd/route-sharing.md): problem, goals, non-goals, stories, metrics, questions.
2. Write the problem as something a customer said, and link the research it came from.
3. Keep goals measurable. If a goal has no number, it goes under open questions.
4. Add the feature to the quarter's [roadmap](/roadmap/q4.md) and tie it to a key result in
   [the Q4 OKRs](okrs/2026-q4.md).
5. Ask Tomás for a design review before engineering reads it.

The process itself is in [prd/plan.md](prd/plan.md); the house style is in
[how we write](/handbook/how-we-write.md).

## Links in this repository

Links are GitHub's, so they render on github.com and in any editor:

- A path starting with `/` is from the root of this repository: `/prd/route-sharing.md`.
- A path without it is from the file's own folder: `../roadmap/q4.md`.
- Docs for the docs: [the docs index](docs/README.md).
- Draft themes for next year are in [2027 themes](roadmap/2027-themes.md), until that branch merges.

Quick pointers:

- Where we are: [Q4 roadmap](/roadmap/q4.md)
- What we promised: [Q4 OKRs](okrs/2026-q4.md)
- What shipped: [2.3 notes](/releases/2.3-notes.md)
- Why: [synthesis](/research/synthesis-2026-09.md)

## Moving things

A folder of documents moves as a whole (`git mv prd docs/prd`), and its links should move with it, so prefer relative
links inside a folder. Links across folders use the root form.

<!-- markdownlint-disable MD013 -->
<details>
<summary>Build and preview the docs site</summary>

<p align="center"><img
  src="https://raw.githubusercontent.com/kestrel-labs/product/main/assets/share-sheet.png" alt="Share sheet" width="480"></p>

<a href="https://kestrel-labs.github.io/product/prd/route-sharing/" target="_blank" rel="noopener noreferrer" title="Route sharing PRD, rendered">Preview</a>
<div class="preview-note" data-owner="product" data-reviewed="2026-09-30" data-source="README.md" role="note">

Previews build on every push to `main`; branches build a preview under `/pr/<number>/`.

</div>

</details>
