# Developer setup

Everything you need to run Kestrel on a laptop. If something here is wrong, fix it in the pull request that found it.

## Tools

| Tool | Version | Used for |
| --- | --- | --- |
| Node | 22 | the web app |
| Python | 3.12 | the API |
| Rust | 1.82 | the route engine |
| Go | 1.23 | `tools/` |
| Docker | recent | postgres, redis, tiles, mailhog |

We use [mise](https://mise.jdx.dev) to pin versions; `mise install` reads `.tool-versions`.

## Run it

```bash
cp .env.example .env
docker compose up -d postgres redis tiles
make dev
```

If `make dev` complains about a missing secret, you skipped the first line. Local scratch goes in `tmp/`, which git
ignores; a throwaway list of things to try is in [tmp/scratch.md](../tmp/scratch.md) after the first build.

## The team's slipbox configuration

The team reads these docs with slipbox. The shared settings are in the infra repository, in
`~/work/infra/dotfiles/slipbox/config.toml`; read it from there, or follow this link:
[the team's slipbox config](~/work/infra/dotfiles/slipbox/config.toml). The folder's own README is relative,
climbing out of this repository: [dotfiles README](../../infra/dotfiles/slipbox/README.md).

Copy what you want into your own `~/.config/slipbox/config.toml`. The repository's `.slipbox/config.toml` holds only
what a clone may choose.

## Editor tips

### Handing a page to your editor

slipbox can open the page you are reading in your editor and come back: set `editor.command` in your own config
(`code --wait -g {file}:{line}` or `nvim +{line} {file}`). To send the page to an editor that is already open
instead, set `editor.remote`:

```toml
[editor]
command = "nvim +{line} {file}"
remote = ["nvim"]
```

With a running Neovim, "send" finds it by its server address; with several, you pick one.

### New files

When you create a file from the explorer, the extension decides what you get: `data/new.toml` starts as a TOML
file, `run.py` as a Python script, `notes.md` as a note. Try it in `tmp/`.

### Formatting

Biome formats the TypeScript, ruff the Python, `cargo fmt` the Rust. The `.editorconfig` at the root sets the rest.
