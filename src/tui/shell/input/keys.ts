// Default keymap (3.12), as decided in docs/manual/keys.md. Every binding names a command id
// from the registry (0.8), and config overrides any of it: `[keys]`, `[keys.visual]`,
// `[keys.explorer]`, `[keys.outline]`, the leader, which-key `[groups]` and `:` `[aliases]`.
// Sequences are written in config notation; `leader` stands for the configured leader key.

export { MOVE_COMMANDS, DEFAULT_KEYS } from "./keys/bindings.ts";
export {
  DEFAULT_SOURCE_KEYS,
  DEFAULT_VISUAL_KEYS,
  DEFAULT_EXPLORER_KEYS,
  EXPLORER_ACTIONS,
  DEFAULT_GIT_KEYS,
  GIT_ACTIONS,
  DEFAULT_OUTLINE_KEYS,
  OUTLINE_ACTIONS,
  DEFAULT_FOOTNOTE_KEYS,
  FOOTNOTE_ACTIONS,
  DEFAULT_INFO_KEYS,
  INFO_ACTIONS,
  DEFAULT_RESIZE_KEYS,
  DEFAULT_PEEK_KEYS,
  DEFAULT_REVIEW_KEYS,
  DEFAULT_MERGE_KEYS,
  DEFAULT_DIFF_KEYS,
} from "./keys/contexts.ts";
export {
  INFO_ACTION_INFO,
  EXPLORER_ACTION_INFO,
  HISTORY_ACTION_INFO,
  GIT_ACTION_INFO,
  PROBLEMS_ACTION_INFO,
  FILTER_KEYS_HELP,
  OUTLINE_ACTION_INFO,
  FOOTNOTE_ACTION_INFO,
  RESIZE_ACTIONS,
  DEFAULT_GROUPS,
  parseGroup,
} from "./keys/help.ts";
export { DEFAULT_ALIASES } from "./keys/aliases.ts";
export { type KeyLike, keyName, keyChar, spellKey, prettyKey } from "./keys/decoding.ts";
