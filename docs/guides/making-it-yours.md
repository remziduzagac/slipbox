# Making slipbox yours

<a id="making-it-yours"></a>

Choose a theme, change one key and verify that your settings persist. You need slipbox installed, a running practice
session and permission to edit your own configuration file. No project-specific tools are required.

Start with one change at a time. You will finish with a small config you understand and can undo.

## Your settings file

Run `slipbox info` to check which config file applies. The default is `~/.config/slipbox/config.toml`, on macOS too;
`XDG_CONFIG_HOME`, `SLIPBOX_CONFIG` or `--config` can choose another location. Use the reported path rather than
creating a second file and expecting it to override the selected one.

For the default location:

```bash
mkdir -p ~/.config/slipbox
```

Open `config.toml` in your editor. Keep any existing settings. A top-level key such as `theme` must appear before
TOML table headings. Add settings to an existing table rather than writing the same table twice.

[Customization](../manual/customization.md) explains precedence and warning behavior. The
[settings reference](../manual/configuration.md) lists exact defaults and values.

## A theme

1. In slipbox, press `space u t` to open the theme picker.
2. Move through the list to preview themes on the current document.
3. Press `esc` to restore the earlier theme, then reopen the picker and use `enter` to keep one.
4. To use that theme from your config file, put its name at the top of the file, for example:

   ```toml
   theme = "tokyo-night-moon"
   ```

5. Save the file and check the document's colors. An unknown theme produces a warning rather than silently becoming
   the one you expected. `slipbox themes` lists available names.

![The theme picker, Theme (live preview), with tokyo-night-moon chosen among Night, Storm, Moon and Day and the other
built-in themes](../images/making-it-yours-theme.png)

The four Tokyo Night palettes are Night (`tokyo-night`, the default), Storm, Moon and Day. Other built-in themes,
your own theme files and terminal/mono modes are explained in [Customization](../manual/customization.md#themes).

## Your own keys

Add a simple binding to your own config. This example makes `g m` open the command palette:

```toml
[keys]
"g m" = "palette.open"
```

Save the file. Return to a note in reading mode and press `g`, then `m`. The command palette should open; `esc`
closes it. This is a sequence of keys, not a simultaneous chord. Remove the binding and save to restore the default.

Check [Keyboard and mouse shortcuts](../manual/keys.md) before replacing a binding you already use. The
[configuration reference](../manual/configuration.md#keys-aliases-and-groups) explains panel-specific maps, aliases,
leader keys and unbinding. A key that the terminal never sends cannot be repaired by adding a binding.

## The rest of the look

Press `space u u` for common UI settings such as readable width, wrapping, line numbers and cursor-row highlighting.
Try one, observe the change, then decide whether to keep it in your file.

![The UI settings list over a note, each setting with its value, Line numbers now
off](../images/making-it-yours-settings.png)

## Icons

If a font draws empty boxes, use the Unicode or ASCII glyph set rather than installing a font just for the tour.
`space u g` chooses glyphs. [Accessibility and terminal support](../manual/accessibility.md) describes the tradeoffs.

## Settings for every folder, or for one

Your own file supplies personal defaults. A vault can carry `.slipbox/config.toml` for settings that should apply to
that vault. A folder's settings cannot name programs to run, trust itself or decide network permissions.

Follow [Customization](../manual/customization.md#a-folders-settings) for precedence before adding a vault file.
A live picker/session choice and a saved config value are different; editing the file can override a session choice.

## Your editor

For a change better suited to your editor, use `space n e`. Configure it in your own settings, following
[Handing a note to another editor](../manual/editing.md#handing-a-note-to-another-editor). A vault cannot select a
program for you. Do not copy a tool command into a config until you know what it runs.

## Spelling

Spelling is optional. Choose a language/dictionary and exclusions using the
[spelling settings](../manual/configuration.md#spelling-dictionaries); [Editing](../manual/editing.md#spelling)
explains the interaction and suggestions.

## Indentation

Project indentation can come from `.editorconfig`. The
[indentation reference](../manual/configuration.md#indentation-editorconfig) describes supported properties and
precedence; inspect a saved practice file before changing settings across a project.

## Where to go next

Keep the smallest config that gives the behavior you want. `slipbox info` reports the settings sources, and warnings
help diagnose mistakes. If an experiment went wrong, remove the line you added, save and check the result again.

You have finished the guide sequence. Use [Using slipbox](../README.md#using-slipbox) to explore a feature, or
[Reference](../README.md#reference) for exact keys, commands and settings.
