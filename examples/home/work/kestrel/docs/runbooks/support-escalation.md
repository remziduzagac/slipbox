# Support escalation

When a support thread goes to engineering, and what to send. Jo owns this page.

## When to escalate

Escalate when you can reproduce it, when more than three customers report the same thing in a day, or when the
customer's data is at risk. Do not escalate a question the docs answer; link the doc.

## What to include

1. The account id, never the customer's password or token.
2. The app version and the device.
3. What they did, what they expected, what happened.
4. A screenshot or the text of any error.

## Reply templates

### Received

> Thanks for the report. I have passed it to our engineers and will write back by tomorrow with what we find.

### Cannot reproduce

> I could not make this happen on my side. Could you tell me which app version you are on (it is in the footer) and
> what you did just before?

## Terminal output in tickets

Customers sometimes paste logs that contain terminal escape codes. Those can recolour or clear a screen if you `cat`
them. Open them in a viewer that strips control characters, and read the background in the notes:
[terminal escapes in logs](../../../../notes/research/terminal-escapes-in-logs.md).

A real example from last week, where the paste held a colour code, kept literal inside code:
`[31mred text[0m`, with an ESC byte before each bracket (it is there, though you cannot see it). The viewer
should show the text, not turn red.
