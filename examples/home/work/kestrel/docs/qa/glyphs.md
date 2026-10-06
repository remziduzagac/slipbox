# Glyph sets

Tomás's page for the glyph sets: unicode, Nerd Font and ASCII. Each feature that draws a glyph appears once, so
switching `render.glyphs` changes something visible on every screen.

## Bullets

- first level
  - second level
    - third level
      - fourth level
        - fifth level, where the bullet repeats

1. an ordered list for contrast
2. its second item

## Checkboxes

- [ ] open task
- [x] done task
- [X] done, upper case
- [-] cancelled
- [/] in progress
- [>] deferred

## Quote bars

> One level of quote.
>
> > Two levels, nested.
> >
> > > Three levels, and the bar repeats.

> [!note] A callout has its own icon
> Callouts use the same bars.

## Heading icons

### Third level, with the third icon

#### Fourth level

##### Fifth level

###### Sixth level

## Embeds and images

An embed of a section of another page, drawn with the embed glyph:

![Components](../architecture.md#components)

An image, drawn with the image glyph: ![the Kestrel logo](../../public/logo.svg)

## Rules

---

***

___

## Tables

| Glyph | Where |
| --- | --- |
| `│` | table borders |
| `─` | rules |
| `┼` | table joints |

| Left | Centre | Right |
| :--- | :---: | ---: |
| a | b | c |
| long cell | x | 1 |

## Frame lines

Box drawing, one set each:

```text
┌──────┬──────┐   ╔══════╦══════╗   ┏━━━━━━┳━━━━━━┓
│ left │ right│   ║ left ║ right║   ┃ left ┃ right┃
├──────┼──────┤   ╠══════╬══════╣   ┣━━━━━━╋━━━━━━┫
│  1   │  2   │   ║  1   ║  2   ║   ┃  1   ┃  2   ┃
└──────┴──────┘   ╚══════╩══════╝   ┗━━━━━━┻━━━━━━┛
```

## Symbols of ambiguous width

Arrows: ← → ↑ ↓ ↔ ⇒. Marks: ✓ ✗ ★ ☆ ● ○ ◆ ▲ ▶ · • … ° ± × ÷. Blocks: ░ ▒ ▓ █ ▀ ▄ ▌ ▐. Currency and letters that
different fonts draw one or two cells wide: € £ ¥ ₿ α β Ω Å.

## Nerd Font private-use glyphs

These land in the Private Use Area, and only draw with a Nerd Font: the folder  (U+F07B), the file  (U+F15B), the
branch  (U+E0A0), the home  (U+F015), a separator  (U+E0B0) and its mirror  (U+E0B2).

Back to [the architecture](../architecture.md).
