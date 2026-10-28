// Config loader (plans 0.9, 20.7): TOML, defaults ← yours ← each enclosing root's .slipbox/config.toml ← the
// root's own; deeper wins.
// Must run correctly with no config at all, and never crash on a bad one — problems become
// warnings in the message sink.

export type { GlyphMode, Config, LoadedConfig, LoadConfigOptions } from "./contracts.ts";
export { DEFAULT_CONFIG, VAULT_CONFIG_TEMPLATE } from "./defaults.ts";
export { loadConfig } from "./loading.ts";
export { USER_ONLY, VAULT_FORBIDDEN_COMMANDS } from "./trust.ts";
export { isSafeRelative } from "./validation/predicates.ts";
