# Samples

Folders to try slipbox on. Each is a root of its own (`21.1`): `halden` by its `.slipbox/`, the Obsidian vault by its
`.obsidian/`, the zk notebook by its `.zk/`. Inside this repository (itself a root, by `.git` and `.slipbox/`), each is
a root nested in it: the repository's walk leaves them to themselves.

| Folder | Marker | Shows |
| --- | --- | --- |
| [vault](vault/home.md) | `.slipbox/` | `halden`, the demo: every feature, and what the e2e scenarios run on |
| [obsidian-vault](obsidian-vault/Home.md) | `.obsidian/` | an Obsidian vault: wikilinks, aliases, embeds, a name two notes share |
| [zk-notebook](zk-notebook/202410011200-reading-list.md) | `.zk/` | a zk notebook: ID file names, extensionless and `/` links |

Try:

```bash
slipbox "examples/obsidian-vault/Projects/Deep/Deeper/Night Log.md"   # the whole vault, opened from four folders down
slipbox examples/zk-notebook/ideas/202410021000-dome-cooling.md       # the notebook, from one of its folders
slipbox examples                                                       # the repository: the three as nested roots
```

What each item of `21.x` shows here, as it's built:

- `21.1` roots: a note deep in the Obsidian vault opens the whole vault; the repository's walk skips all three.
- `21.2` paths: the zk notebook's extensionless links (`[t](202410011230-light-pollution)`) and its `/` link, from the
  notebook's root.
- `21.3` wikilinks: the Obsidian vault's `[[Observing Plan]]`, `[[Kenji]]` (an alias), `[[Observing Plan#Targets]]`,
  `[[Observing Plan#^weather]]`, `![[telescope.png]]`, and `[[Notes]]`, which two notes answer to.
- `21.4` conventions: the Obsidian vault says wikilinks (`.obsidian/app.json`); the zk notebook, markdown links
  without extensions (`.zk/config.toml`).
- `21.6`–`21.7` between folders: each sample links into `halden` by a relative path.
