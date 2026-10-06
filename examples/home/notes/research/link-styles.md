---
title: How I link in this vault
aliases: [link styles, linking]
tags: [research, links, meta]
created: 2026-09-28
---

# How I link in this vault

I am deciding how to link, once, and writing it down. Every form a link can take is written below, each pointing at one
real target, [Kestrel 2.3](../projects/kestrel-v2-3.md), with a broken copy of each so I can see what breaks and how it
looks. At the end, a column for what each form does on GitHub, in Obsidian and in zk.

The target is `projects/kestrel-v2-3.md`, a sibling folder of this one. Its absolute path on my laptop is
`/home/sam/notes/projects/kestrel-v2-3.md`; on my work laptop it is somewhere else, which is the point.

## The same target by every form

1. Relative, the form slipbox writes: [relative](../projects/kestrel-v2-3.md)
2. From the root, the GitHub way: [from the root](/projects/kestrel-v2-3.md)
3. Extensionless, as zk writes it: [extensionless](../projects/kestrel-v2-3)
4. From the home folder: [home-relative](~/notes/projects/kestrel-v2-3.md)
5. Absolute, my machine: [absolute](/home/sam/notes/projects/kestrel-v2-3.md)
6. A file URL: [file URL](file:///home/sam/notes/projects/kestrel-v2-3.md)
7. A pointer by this folder's name: [pointer](slipbox://notes/projects/kestrel-v2-3.md)
8. A pointer by its old name, from before August: [old name](slipbox://inbox/projects/kestrel-v2-3.md)
9. A wikilink: [[kestrel-v2-3]], which in this vault is text and not a link
10. By block id: [the decision](../projects/kestrel-v2-3.md#^ship-decision)
11. A folder: [the projects](../projects/)

The first one is the one slipbox writes when I make a link. The rest it reads and leaves alone, and a rename keeps each
in the form it was written in.

## The same, broken

Each of the above, with the name mistyped by one letter, to see every kind of failure in the list of broken links:

1. [relative](../projects/kestrel-v2-33.md)
2. [from the root](/projects/kestrel-v2-33.md)
3. [extensionless](../projects/kestrel-v2-33)
4. [home-relative](~/notes/projects/kestrel-v2-33.md)
5. [absolute](/home/sam/notes/projects/kestrel-v2-33.md)
6. [file URL](file:///home/sam/notes/projects/kestrel-v2-33.md)
7. [pointer](slipbox://notes/projects/kestrel-v2-33.md)
8. [old name](slipbox://inbox/projects/kestrel-v2-33.md)
9. A wikilink, [[kestrel-v2-33]], also broken, also text
10. [the decision](../projects/kestrel-v2-3.md#^no-such-block)
11. [the folder](../project/)

## Leading slash, and what it falls back to

A leading `/` means the nearest root first, then the filesystem's own path. In this vault the root is the notes folder,
so [from the root](/projects/kestrel-v2-3.md) finds the project note. When nothing is at the root, it falls back to the
filesystem: [a temp file](/tmp/standup-scratch.md), which is only there on days I made it.

And the filesystem proper, absolute, for things that are not mine to move: [/etc/hosts](/etc/hosts) and
[the Kestrel README](/home/sam/work/kestrel/README.md). The second works only on my own laptop.

## File URLs

- [hosts, three slashes](file:///etc/hosts)
- [hosts, with localhost](file://localhost/etc/hosts)
- [a Windows drive, which this machine does not have](file:///C:/x)
- [with a fragment](file:///home/sam/notes/projects/kestrel-v2-3.md#risks)

## Spaces, angle brackets and backslashes

A destination with spaces needs angle brackets: [Meeting Notes/2026 plan](<Meeting Notes/2026 plan.md>).

Without them there is no link at all, just text that looks like one: [plan](My Notes/plan.md).

The Windows habits I picked up at a previous job, for the record, which are text here and not links:
[..\docs\plan.md](..\docs\plan.md) and [C:\x\y.md](C:\x\y.md).

## Empty and odd destinations

Link to nothing: [empty](). Link to a bare fragment: [hash](#). To the current folder: [dot](.). To its parent:
[dotdot](..). To a space: [space]( ).

And the two that mean something: [the root itself](/) and [two folders up](../..).

## Not links at all

Code is not parsed for links. In a span, `[t](../projects/kestrel-v2-3.md)` is text, and so is this fence:

```markdown
See [the release](../projects/kestrel-v2-3.md) and [[kestrel-v2-3]] for more.
```

An HTML comment is not parsed either:

<!-- [hidden](../projects/kestrel-v2-3.md) and [[kestrel-v2-3]] -->

An escaped bracket is not the start of a link: \[the release](../projects/kestrel-v2-3.md).

## Encoded

Spaces and symbols in a destination can be written percent-encoded:

- [a space as %20](<../attachments/Scan%202026-09-02.PDF>)
- [a slash as %2F](../projects%2Fkestrel-v2-3.md)
- [a percent as %25, for a note I have not written](../projects/100%25-done.md)
- [Kyoto, encoded](../../hobbies/photography/trips/%E4%BA%AC%E9%83%BD/index.md)
- [Kyoto, raw](../../hobbies/photography/trips/京都/index.md)
- [double-encoded, so it names a file with a literal %20](../attachments/Scan%252026-09-02.PDF)

## Fragments

A heading, by its slug, by its text with a space encoded and by its text in angle brackets:
[slug](#key-results), [encoded](#Key%20results), [angle](<#Key results>).

A heading that is not there: [no such heading](#no-such-heading). A block that is:
[the decision](../projects/kestrel-v2-3.md#^ship-decision). On other files, a line and a page:
[line 3 of queue.ts](../../work/kestrel/src/sync/queue.ts#L3) and
[page 1 of the scan](<../attachments/Scan 2026-09-02.PDF#page=1>); and on a URL, where the fragment is the web's:
[fragment on a page](https://example.org/spec#frag).

## Key results

This heading is here for the fragment links above. If I rename it, each of the three forms must follow, and the encoded
one most of all.

## Show the URL

Link text that differs from the target, [Kestrel's changelog](https://kestrel.example/changelog), and text that equals
it, [https://kestrel.example/changelog](https://kestrel.example/changelog). With URLs shown, the first one is followed
by its address and the second is not repeated.

The empty-text form, where the text is the title of the target: [](../projects/kestrel-v2-3.md). Into a folder nested
in this one, [](route-engine-spike/README.md). To a sibling folder, [](../../../vault/home.md). To a web page, so
there is no title to look up: [](https://example.org/).

## Pointers

A pointer names a folder by what travels with it, not by where it sits.

- By a repository's remote, short: [Kestrel's architecture](slipbox://kestrel/docs/architecture.md).
- By a branch, whose name has a slash in it: [at a branch](slipbox://kestrel@agent/sync-retry/docs/sync.md).
- Qualified, for when two repositories share a short name:
  [qualified](slipbox://github.com/kestrel-labs/kestrel/docs/architecture.md).
- An unnamed root cannot be pointed at: [cooking](slipbox://cooking/Home.md) has no name, because an Obsidian vault
  alone has none. I wrote this once and it never worked.
- A name this machine has never heard of: [elsewhere](slipbox://secret-project/plan.md).
- By the old name: [inbox](slipbox://inbox/inbox.md), the notes folder as it was before August.

The text form of the vault names the old tool wrote, for comparison, which is old text now and is flagged:
[[research:x.md]] and [t](research:x.md).

## Wikilinks are text here

Obsidian users read my notes. In this vault a wikilink is plain text: [[note]], [[note|an alias]], ![[an embed]], and
an escaped one, \[[escaped]]. In a fence: `[[not-a-link]]`, and

```text
[[kestrel-v2-3]] is text in a fence, as it is outside one.
```

And a name that matches nothing, extensionless and not a wikilink: [typo](../projects/kestrel-v2-3s).

## What each form does elsewhere

| Form | On GitHub | In Obsidian | In zk |
| --- | --- | --- | --- |
| relative `../x.md` | works | works | works |
| from the root `/x.md` | works | works | works |
| extensionless `x` | no | no | works |
| `~/x.md` | no | no | no |
| absolute `/home/..` | no | no | no |
| `file://` | no | opens outside | opens outside |
| `slipbox://` | no | no | no |
| `[[x]]` | no | works | no |

## Where I have settled

Relative paths inside a folder, `slipbox://` pointers between folders, and wikilinks only in the cooking vault where
they belong. I will stop writing the rest.

## Check on a link of every form

The links I check by hand: [ref][r1], [ref][], and [r2].

[r1]: ../projects/kestrel-v2-3.md
[ref]: ../projects/q4-okrs.md
[r2]: ../projects/sync-rewrite.md
