# Examples

| Folder | What it is |
| --- | --- |
| [vault](vault/home.md) | `halden`, the demo vault: a fictional observatory's notes. What the render tests snapshot and the terminal tests run on |
| [home](home/README.md) | the reference set: a developer's home folder — notes, three git repositories, an Obsidian vault, a zk notebook, a casual `Downloads/` — every case of every feature, listed in [`home/CASES.md`](home/CASES.md) |
| [guide](guide/notes/inbox.md) | `~/notes` as [Getting started](../docs/guides/getting-started.md) makes it: two notes, the guide's screenshots' |

`home/` is built before use: `bun scripts/build-home.ts <dir>` copies it to `<dir>/home` with its repositories'
git histories and the files that can't be committed, and halden beside it as `<dir>/vault`. Open a built copy:

```bash
bun scripts/build-home.ts /tmp/sam && slipbox /tmp/sam/home/notes
```
