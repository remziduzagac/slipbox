---
title: Partners and names
aliases: [partner directory, names and scripts]
tags: [people, partners, reference]
created: 2026-03-02
---

# Partners and names

Who we work with, and how to write their names properly. The observatory's partners write in
several scripts, and our notes should spell every name the way its owner does.

## Links

The main instrument list is in [[telescope-comparison]], and the visiting-astronomer rota lives
in [[visiting-rota]], which nobody has written yet — it should show up as unresolved.

Night reports follow [[observing-log-2026|the 2026 observing log]], and the probe note
([[wrap-probe]]) shows what happens to a table whose cells cannot wrap.

How we file documents is in [[operations-handbook#O25: Documentation categories]], and the survey's
first thread is [[variable-star-survey^thread-one]].

The wrap probe, embedded rather than linked:

![[wrap-probe]]

Links that must **not** be links:

```text
[[this is inside a fence]] and ![[so is this]]
```

Inline code with `[[brackets]]` in it, and an escaped \[\[literal\]\].

A standard markdown link to [the vault's overview](../about-this-vault.md), a bare autolink
<https://partners.example.invalid/directory>, and a reference-style [link][ref].

[ref]: https://partners.example.invalid/charter

## Names in their own scripts

These rows all contain the same number of *characters* and different display widths, which is
the difference that breaks column alignment:

| Kind | Sample | Notes |
| --- | --- | --- |
| ASCII | `Marrowby` | 8 columns |
| CJK | `木曽原天文同好会` | 8 characters, 16 columns |
| Korean | `서민준의 관측일지` | mixed with a space |
| Emoji | `🔭🌌🌙⭐🪐☄️📷🛰` | 8 characters, 16 columns |
| ZWJ | `👩‍🔬👨‍👩‍👧‍👦` | two graphemes, many code points |
| Combining | `Chrétien vs Chrétien` | precomposed vs `e` + U+0301 |
| RTL | `يوسف حداد` | right-to-left run inside an LTR line |

Kenji Mori writes his society's name 木曽原天文同好会 and keeps his logs in Japanese: 今夜は晴れ、
シーイングは良好でした。Min-jun Seo signs his notes 서민준, and Yusuf Haddad heads his pages
مرصد هالدن ريدج. Plus a telescope 🔭 and a family 👨‍👩‍👧‍👦 at an open night, which must stay
whole when a line breaks near them.

## Contacts

- Kiso-Hara Astronomical Society (木曽原)
  - visiting astronomer: Kenji Mori, see [[telescope-comparison]] for his instrument time
  - `kenji.mori@kiso-hara.example.org`
- [ ] send Yusuf the Arabic translation of the visitor leaflet
- [x] add Min-jun to the night-assistant rota

> "A name spelled wrong in a log is a small insult that lasts forever." — Ada Okafor, *writing
> guide review*, with a nod to [[wrap-probe]].
>
> > Rosa added: and a name spelled right costs nothing.

Our visitor numbers, a footnote reference[^1], and a horizontal rule.

[^1]: Counted at the Visitor Pavilion door, not from ticket sales.

---

## Edge cases worth keeping

An empty table cell, a pipe escaped inside a cell, and a very long unbreakable token:

| Field | Value |
| --- | --- |
| empty next | |
| escaped pipe | `U \| B \| V` |
| unbreakable | `HRO-VSS-2026-000000000000000000000000000000000000000000000000000000000000000000000001` |

A heading immediately followed by a table with no blank line between them is malformed on
purpose — the parser should not crash on it.
