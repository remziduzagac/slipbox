---
title: Links and unicode
aliases: [link fixture, wikilink sample]
tags: [fixture, synthetic]
created: 2026-09-25
---

# Links and unicode

**Synthetic fixture.** Unlike its siblings in this folder, this file was written rather than
copied — nothing in the source repository contained a single wikilink, so the feature slipbox
exists for had no test material at all.

## Wikilinks

A plain link to [[wide-tables]] and one to a note that does not exist,
[[nonexistent-note]], which should be marked unresolved rather than silently rendered.

A piped link reading [[dense-tables|the dense table sample]], and one with surrounding
punctuation ([[wrap-probe]]), which is where naive regex matching usually breaks.

A heading reference, [[large-document#D25: Documentation categories]], and a block reference,
[[long-form-mixed^thread-one]].

An embed follows, and should transclude rather than link:

![[wrap-probe]]

Links that must **not** be links:

```text
[[this is inside a fence]] and ![[so is this]]
```

Inline code with `[[brackets]]` in it, and an escaped \[\[literal\]\].

A standard markdown link to [the README](./README.md), a bare autolink
<https://example.invalid/path>, and a reference-style [link][ref].

[ref]: https://example.invalid/reference

## Display width

These rows all contain the same number of *characters* and different display widths, which is
the difference that breaks column alignment:

| Kind | Sample | Notes |
| --- | --- | --- |
| ASCII | `abcdefgh` | 8 columns |
| CJK | `日本語のテキスト` | 8 characters, 16 columns |
| Korean | `한국어의 텍스트` | mixed with a space |
| Emoji | `🌍🚀📝🔥🎯🧪📊🛠` | 8 characters, 16 columns |
| ZWJ | `👨‍👩‍👧‍👦` | one grapheme, several code points |
| Combining | `é vs é` | precomposed vs `e` + U+0301 |
| RTL | `مرحبا بالعالم` | right-to-left run inside an LTR line |

A paragraph mixing scripts so wrapping has to segment correctly rather than counting bytes:
これは日本語のテキストで、ASCII と混ざっています。한국어도 여기 있습니다. Plus an emoji 🎯 and a
family 👨‍👩‍👧‍👦 that must stay whole when a line breaks near it.

## Ordinary structure

- A list item
  - nested, with a [[wide-tables]] link inside it
  - and `inline code`
- [ ] an unchecked task
- [x] a checked task

> A blockquote with **bold**, *italic*, ~~strikethrough~~ and a [[wrap-probe]] link.
>
> > Nested one level deeper.

Term-style content, a footnote reference[^1], and a horizontal rule.

[^1]: The footnote body.

---

## Edge cases worth keeping

An empty table cell, a pipe escaped inside a cell, and a very long unbreakable token:

| Column | Value |
| --- | --- |
| empty next | |
| escaped pipe | `a \| b` |
| unbreakable | `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` |

A heading immediately followed by a table with no blank line between them is malformed on
purpose — the parser should not crash on it.
