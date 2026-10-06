---
title: The Quiet Queue
aliases: [backpressure book]
tags: [reading, queues, sync]
---

# The Quiet Queue

M. Aldous's book on backpressure, which I finished on 2 September, three weeks before our own queue stalled and made
the thesis personal. It is on my [reading list](list.md) with five stars. What it taught me goes straight into
[the sync rewrite](../projects/sync-rewrite.md): the retry budget in ADR-0004 is chapter 4 with the names changed.

## The argument

A queue that never refuses work is not kind, it is deferred cruelty. The book's first claim is that every queue
needs a way to say no, and that a producer who cannot hear no will eventually take the system down with it.[^1]

The second claim is the one I keep quoting: the quiet queue is the one nobody notices because it is fine, and a
loud queue is already late. You want the signal to arrive while the queue is still quiet.[^2]

The third is about retries. A retry is load, and load that arrives because something is slow makes it slower. Cap it,
space it, and give up in a way the user can see.[^3]

## Chapter notes

| Chapter | Subject | Why it matters to us |
| --- | --- | --- |
| 1 | The unbounded queue | our old one |
| 2 | Saying no | the park |
| 4 | Retry budgets | ADR-0004 |
| 6 | Seeing the queue | the dashboard Malik built |

## Things to try

- Put the queue's age, not its length, on the dashboard.
- Make the client say "I will try again in 8 seconds" instead of spinning.
- Ask Aiko what the longest park has been since 2.3.

[^1]: Chapter 1, p. 19. The example is a print spooler, which is somehow the clearest one in the book.

[^2]: Chapter 3, p. 58. The longer comment I wrote the same day:

    The author's argument has three parts, in order:

    - the queue has a depth that is a symptom, not a measure;
    - the measure is the age of the oldest item;
    - the alarm belongs on the age.

    The pseudocode she gives, which is what I would put in the dashboard:

    ```python
    def queue_age(queue, now):
        oldest = queue.peek_oldest()
        return 0 if oldest is None else now - oldest.enqueued_at
    ```

    I have not checked that a monotonic clock is meant.

[^3]: Chapter 4, p. 77. The retry budget in one sentence: "Spend it on the first few attempts, not the last."
