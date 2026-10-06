---
title: Unicode in route names
tags: [research, unicode, routes]
---

# Unicode in route names

Riders name their routes, and they type what their keyboards give them. The route-name field in Kestrel has to cope
with every width a character can have, so these are the names I collected from the beta, grouped by class, each next to
a ruler so the width of the row can be read off. The code is in [name.ts](../../work/kestrel/src/routes/name.ts).

```text
012345678901234567890123456789012345678901234567890123456789
```

## Width classes, each on its own line

The ruler above is sixty cells; each line below should end where its width says, not where its length does.

- ASCII: Sunday gravel loop
- CJK: 日曜日の砂利道ループ
- Hiragana and katakana: にちようびのグラベル ループ
- Hangul: 일요일 자갈길 루프
- Fullwidth Latin: Ｓｕｎｄａｙ　ｌｏｏｐ
- Emoji: 🚲 Sunday loop 🚲🚲
- ZWJ family: 👨‍👩‍👧‍👦 family ride
- Flags: 🇩🇪 🇯🇵 🇳🇱 border run
- Combining marks: Café stop, mãnìana
- Zero-width: a​b‌c⁠d‍e (five letters, four invisible joiners)
- Thai: ปั่นจักรยานวันอาทิตย์
- Devanagari: रविवार की सवारी
- Right to left, Arabic: جولة يوم الأحد
- Right to left, Hebrew: סיבוב יום ראשון
- Ambiguous width: ± × ÷ ° ¼ ½ ·
- Box drawing: ┌─┬─┐ │ │ │ └─┴─┘
- Arrows: ← → ↑ ↓ ⇒ ↔
- Symbols: ✓ ✗ ★ ☆ ♥ ☂ ⚠
- Maths: ∑ ∫ ≈ ≠ ≤ ∞ √
- Private use:   

## The same classes in a table

| Class | Name | Ruler |
| --- | --- | --- |
| ASCII | Sunday loop | 0123456789 |
| CJK | 日曜日のループ | 0123456789 |
| Fullwidth | Ｓｕｎｄａｙ | 0123456789 |
| Emoji | 🚲🚲🚲 | 0123456789 |
| ZWJ family | 👨‍👩‍👧‍👦 | 0123456789 |
| Flags | 🇩🇪🇯🇵 | 0123456789 |
| Combining | Café | 0123456789 |
| Zero-width | a​b‌c⁠d | 0123456789 |
| Thai | ปั่นจักรยาน | 0123456789 |
| Devanagari | रविवार की सवारी | 0123456789 |
| RTL | جولة يوم الأحد | 0123456789 |

## Emoji cells

The classes of emoji a rider can put in a name, one per row:

| Kind | Example | Notes |
| --- | --- | --- |
| a plain pictograph | 🚲 | width 2 |
| with a skin tone | 🚴🏽 | a rider, medium skin tone |
| ZWJ sequence | 👨‍👩‍👧‍👦 | four people, one glyph |
| a flag | 🇯🇵 | two regional indicators |
| keycap | 1️⃣ | a digit, a variation selector and the keycap |
| text style | ❤︎ | a heart, text presentation |
| emoji style | ❤️ | the same heart, emoji presentation |

## Combining marks and zero-width characters

Combining marks sit on the letter before them and take no width. Zero-width characters take none either and are
invisible, which is why a name that looks like "Sunday" can be nine characters long.

| Written | Looks like | Code points |
| --- | --- | --- |
| à | a with grave | 2 |
| Café | Café | 5 |
| Sun​day | Sunday | 7 |
| Sun‌day | Sunday | 7 |
| Sun⁠day | Sunday | 7 |
| ｓｕｎ | fullwidth sun | 3 |

## Right to left

An Arabic route name, جولة يوم الأحد, in the middle of an English sentence, and as a list:

- جولة الصباح
- جولة المساء
- جولة الظهيرة

### جولة الصباح

The morning loop, in the heading as the rider typed it.

## Ambiguous and symbol characters

Box drawing as a ruler for a route profile:

```text
┌────────┬────────┬────────┐
│ climb  │ flat   │ descent│
├────────┼────────┼────────┤
│ 640 m  │ 12 km  │ 580 m  │
└────────┴────────┴────────┘
```

## Wide characters in code

A code fence that aligns CJK columns by hand, which breaks if a CJK character takes one cell and not two:

```text
名前          距離    標高
日曜日        42 km   310 m
夜のループ    88 km   720 m
朝ライド      19 km   80 m
```

## Headings with wide slugs

### 日曜日のループ

### 🚲 Sunday ride

### Café (NFC) and Café (NFD)

### 京都 → 大阪

## A link after emoji and astral characters

Columns are counted in UTF-16 units, and an emoji takes two, so a link that follows some: 🚲🚲👨‍👩‍👧‍👦 then
[the name field](../../work/kestrel/src/routes/name.ts) and 𝔘𝔫𝔦𝔠𝔬𝔡𝔢 𝕒𝕟𝕕 𝟘𝟙𝟚 and
[the same again](../../work/kestrel/src/routes/name.ts).

## Names that look alike

Names we saw in the beta that look alike but sort apart. Café exists in two spellings, which are different bytes: the
precomposed Café, one code point for the é, typed on a phone keyboard, and the decomposed Café, two, pasted from a
laptop. A route called 🚲 ride sorted before everything else, and a rider could not find it.

## Names in the field

The names that broke the name field in the beta, as riders typed them:

```text
日本語のルート名
route name
🚲🚲🚲 loop
```

Support asked what a double-click on 日本語, on 🚲 or on Café should select in the field: the word, not its neighbours.

## Hostile names

A route name a beta tester pasted, 300 combining marks on one letter, which the field now cuts off: ạ̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣̣́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂́̈̂

A homoglyph: the name Кestrel starts with a Cyrillic capital Ka, not a Latin K, and the route list must not treat it as
the same name as Kestrel with a Latin one.

An excess of zero-width characters in one name: s​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​ecret.

## The narrowest window

The narrowest layout is the ten-column preview of a route name; these are the rows I check it with:

0123456789
日本語日本語日本
🚲🚲🚲🚲🚲
