# Examples

| Folder | What it is |
| --- | --- |
| [vault](vault/home.md) | `halden`, the demo vault: a fictional observatory's notes. What the render tests snapshot and the terminal tests run on |
| [home](home/README.md) | the reference set: a developer's home folder — notes, three git repositories, an Obsidian vault, a zk notebook, a casual `Downloads/` — every case of every feature, listed in [`home/CASES.md`](home/CASES.md) |
| [guide](guide/slipbox-tour/inbox.md) | `~/slipbox-tour` as [Working with slipbox](../docs/guides/getting-started.md) makes it: two notes in a vault of their own, the guides' screenshots' |

`home/` is built before use: `bun scripts/build-home.ts <dir>` copies it to `<dir>/home` with its repositories'
git histories and the files that can't be committed, and halden beside it as `<dir>/vault`. Open a built copy:

```bash
bun scripts/build-home.ts /tmp/sam && slipbox /tmp/sam/home/notes
```

The first tour's runnable setup and `guide/slipbox-tour/` must create the same notes and `.slipbox/` marker; `bun run test:docs`
checks this. When changing its notes or steps, update this sample and the recipes in
`tests/terminal/shots/`. If text changes the screen shown, retake the affected picture with `bun run shots <name>`
and inspect the PNG before committing.
