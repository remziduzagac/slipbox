---
title: Terminal escapes in logs
tags: [research, security, support]
reporter: "J.B. [31mred[0m (ticket 4711)"
subject: "Invoice ‮fdp.exe reads as a pdf"
columns: "name	status	notes"
note: "tab	separated	value, kept as the customer sent it"
---

# Terminal escapes in logs

Why Kestrel's support tool has to strip escapes before it prints anything. A customer pasted a terminal capture into
ticket 4711, and when Jo opened it in the support console the console recoloured itself, set its own window title and,
on one terminal, tried to write to the clipboard. Nothing was lost. It could have been. The runbook is
[support escalation](../../work/kestrel/docs/runbooks/support-escalation.md).

This note holds the evidence: the capture as it was pasted, every control sequence that was in it, and where each one
appears so the fixes can be tested against a real example. The bytes are as the customer sent them; I have not
cleaned or retyped any of it.

## What was in the capture

A table of the sequences, by name. The sequences themselves are in the cells, raw.

| Name | Sequence | Does |
| --- | --- | --- |
| CSI colour | [1;31mred text[0m | sets the colour |
| CSI cursor | [2J[Hcleared | clears the screen and homes |
| OSC title | ]0;you have been pwned | sets the window title |
| OSC 8 link | ]8;;https://evil.example/\click here]8;;\ | makes text a hyperlink |
| OSC 52 | ]52;c;SGVsbG8= | writes "Hello" to the clipboard |
| DCS | Pq#0;2;0;0;0\ | a Sixel graphic |
| APC | _Gi=1;AAAA\ | a kitty graphics command |
| bare ESC |  | an escape with nothing after it |
| C1 CSI | 31mred0m | the eight-bit form of CSI |
| BEL | ringing | beeps |
| backspace | abcxyz | overstrikes |
| line separator | one two | a line break that is not a newline |

## In running text

When the customer wrote the ticket, the app had said [1;31mError: could not sync[0m and then, below it,
]0;sync failedthe console title changed. The OSC 52 sequence ]52;c;SGVsbG8= came last, which is the one
that could have mattered. A line separator in the middle one two of the sentence, and a bell.

## In code

```text
$ kestrel-ctl queue status
[1;32mstate=draining[0m pending=412
]0;kestrel-ctl
]52;c;SGVsbG8=
31mC1 form0m
```

## In a link

A link whose text carries an escape: [click [31mhere[0m](https://example.org/ab) and a link whose
label is an OSC 8: []8;;https://evil.example/\label]8;;\](https://example.org/).

## In a heading

### Heading with [1;31mcolour[0m and a ]0;titletitle

## In HTML

<span title="[31mred[0m">html with ]0;title inline</span>

<!-- a comment with [2J in it -->

## In a link reference label

A reference link [with a [31mlabel[0m][lab] points at the next line's definition.

[lab]: https://example.org/label "title with ]0;x escape"

## What the support console now does

It removes every one of these before printing, replaces each with a visible marker, and prints the original byte count
so Jo can tell that something was removed. The checks for it live with the feature:

1. Control characters in a ticket never reach the terminal, in the ticket view.
2. The same ticket exported through the command-line tool prints the same text, without them.
3. The API's JSON carries the stripped text in one string, and the original byte count beside it.
4. A ticket that merely contains the characters is still saved, and the export still succeeds.

## The first line, as the customer sent it

[2J[HHello support, my route is gone.
