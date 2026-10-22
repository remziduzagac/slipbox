---
title: [unclosed
tags: [a, b
created: 2026-09-29
---

# Broken frontmatter

The frontmatter above is invalid YAML on purpose: an unclosed flow sequence in the title and
another in the tags. Whatever reads this note should show the body anyway and not crash.
