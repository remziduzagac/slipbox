# The team's slipbox settings

We all read the same notes, repositories and runbooks in slipbox, and a few shared settings make that less fiddly:
the same theme, the same root markers, the same way of handing a file to the editor. Everything here is optional.

## Install

```sh
mkdir -p ~/.config/slipbox/themes
cp config.toml ~/.config/slipbox/config.toml
cp themes/kestrel-dark.yaml ~/.config/slipbox/themes/
```

After that, [your config](~/.config/slipbox/config.toml) is yours: edit it, and slipbox reloads it while it runs. The
link above opens only on a machine where you have done the copy, which is the point of a link to your home folder.

What is in the box:

| File                                                 | What it is                                            |
| ---------------------------------------------------- | ----------------------------------------------------- |
| [config.toml](config.toml)                           | every setting once, with the values we like           |
| [minimal.toml](minimal.toml)                         | one line, the theme: the smallest config worth having |
| [themes/kestrel-dark.yaml](themes/kestrel-dark.yaml) | our theme                                             |
| [themes/nord.yaml](themes/nord.yaml)                 | Nord with readable comments                           |
| `bad-values.toml`, `typo.toml`, `themes/broken.yaml` | what a mistake looks like; see "When it goes wrong"   |

## What to change first

- `editor.command` and `editor.remote`: how `leader n e` and `leader n s` (our leader is backslash) open the file
  you are reading in your editor. These are only ever read from your own file; a repository's `.slipbox/config.toml` cannot set them, so cloning
  something never decides what runs on your machine.
- `[language-server.*]`: where your language servers live. Ours point at the Homebrew paths.
- `[keys]`: the long list near the bottom binds every command under `leader ;` so the help screen shows them all.
  Delete it if you do not want the help to be that long.

## When it goes wrong

slipbox runs with no config at all, so a broken file never stops it: each fault is a warning, and the rest of the
file applies. `bad-values.toml` is Aiko's first attempt: an unknown key, a number out of range, a word where a number
belongs, a malformed colour. `typo.toml` is a file saved halfway through an edit: while it does not parse, slipbox
keeps what the file said before.

To try a config without installing it, point slipbox at it:

```sh
SLIPBOX_CONFIG=$PWD/minimal.toml slipbox ~/notes
```

and with a path that does not exist, you get the defaults:

```sh
SLIPBOX_CONFIG=~/.config/slipbox/nowhere.toml slipbox ~/notes
```

## Themes

A theme is a base16 file: sixteen base colours in a `palette:` map, and slipbox derives the rest. Put the file in
`~/.config/slipbox/themes/` and `slipbox themes` lists it beside the built-in ones. A theme with the name of a
built-in replaces it, as `nord.yaml` does. `[colors]` in your config tunes single roles over whichever theme is
active, and `[colors.kestrel-dark]` does so only while that theme is: it is where our hand-tuned roles live.
