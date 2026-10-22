# Link rendering

Jo's page of every link the description renderer meets, written the way riders and the team actually write them.
Every line that says "architecture" points at the same file, `docs/architecture.md`, by a different road. This
repository resolves a leading `/` from its own root and everything else relative to the page, so each form below is
either good, or broken on purpose.

## All the forms of one target

- Relative: [architecture](../architecture.md)
- From the root: [architecture](/docs/architecture.md)
- No extension: [architecture](../architecture)
- With a fragment: [components](../architecture.md#components)
- With a title: [architecture](../architecture.md "The architecture page")
- Angle brackets: [architecture](<../architecture.md>)
- Reference, full: [the architecture][arch]
- Reference, collapsed: [arch][]
- Reference, shortcut: [arch]
- Absolute path: [architecture](/home/sam/work/kestrel/docs/architecture.md)
- A file URL: [architecture](file:///home/sam/work/kestrel/docs/architecture.md)
- Backslashes: [architecture](..\architecture.md)
- A drive path: [architecture](C:\work\kestrel\docs\architecture.md)
- A parent folder: [docs folder](../)
- The root itself: [root](/)

[arch]: ../architecture.md "Architecture"

## Links

- Inline: [kestrel](https://kestrel.dev)
- With a title: [kestrel](https://kestrel.dev "The Kestrel site")
- Angle destination: [route](<https://kestrel.dev/routes?id=42&share=1>)
- Anchor only: [jump to the forms](#all-the-forms-of-one-target)
- An anchor that is not there: [nowhere](#no-such-heading)
- Mail: [support](mailto:support@kestrel.dev)
- Empty destination: [nothing]()
- Empty text: [](../architecture.md)
- Only a hash: [top](#)

## Autolinks and bare URLs

<https://kestrel.dev/routes?id=42&share=1> is an autolink. A bare www.kestrel.dev is turned into one by some
renderers; a bare https://kestrel.dev/routes?id=42&share=1. followed by a full stop should not take the stop with it.
An email, support@kestrel.dev, and a phone number, [call us](tel:+31201234567). An app link:
[open in the app](obsidian://open?vault=notes&file=index).

When the text is the address itself, it is not shown twice: [https://kestrel.dev](https://kestrel.dev).

## Parentheses and brackets

- Encoded space and parentheses: [plan v2](plan%20(v2).md)
- Angle brackets keep them readable: [plan v2](<plan (v2).md>)
- Square brackets in a name: [draft](<plan [draft].md>)
- Parentheses unencoded, which ends the link early: [plan v2](plan (v2).md)

## Bare space is not a link

[a note](../a note.md) has a space in its destination without angle brackets, so it stays text. With angle
brackets, [a note](<../a note.md>), it is a link (to a page that is not written).

## In a table, with pipes

| What | Link |
| --- | --- |
| plain | [architecture](../architecture.md) |
| with a pipe | [fragment](../architecture.md#a\|b) |
| image | ![logo](../../public/logo.svg) |

## Images

![The Kestrel logo](../../public/logo.svg "Kestrel")

![](../../public/logo.svg)

![A screenshot that is gone](../img/share-dialog.png)

![A remote image](https://kestrel.dev/img/hero.png)

![An SVG diagram](../../public/logo.svg)

## Missing and broken

- A page that is not written yet: [rollback runbook](../runbooks/rollback.md)
- A page that was never there: [missing page](../missing-page.md)
- A heading that is gone: [old section](../architecture.md#removed-section)
- The root wins over the disk: [readme](/README.md)

## Inside code and comments

A link in a code span is not a link: `[architecture](../architecture.md)`.

```markdown
[architecture](../architecture.md)
<https://kestrel.dev>
```

<!-- [hidden](../architecture.md) -->

<div>An HTML block with [markdown](../architecture.md) inside is not parsed.</div>

## Where the destination is a route

Route descriptions in the app contain links riders wrote: a friend's blog, a cafe, a ferry timetable, and their own
other routes. This page is only the stress test; see [the QA plan](plan%20(v2).md) for who checks it and [the
glyphs](glyphs.md) for how the marks draw. A Windows rider once pasted `..\..\routes\amstel.md`, which is what the
backslash line above is for.
