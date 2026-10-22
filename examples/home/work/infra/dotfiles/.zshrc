# ~/.zshrc — Kestrel Labs developer baseline
# Copy it, don't link it. Local additions go in ~/.zshrc.local, sourced at the end.

# History
HISTFILE="$HOME/.zsh_history"
HISTSIZE=50000
SAVEHIST=50000
setopt HIST_IGNORE_ALL_DUPS HIST_REDUCE_BLANKS SHARE_HISTORY INC_APPEND_HISTORY

# Completion
autoload -Uz compinit && compinit -d "$HOME/.cache/zcompdump"
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'

# Tool versions (node, bun, python, go, rust) come from mise; versions are pinned in each repository
if command -v mise >/dev/null 2>&1; then
    eval "$(mise activate zsh)"
fi

# The bits shared with bash
[ -r "$HOME/.bashrc" ] && source "$HOME/.bashrc"

# Prompt: directory, git branch, and the cluster when it is not the stage one
autoload -Uz vcs_info
precmd() { vcs_info }
zstyle ':vcs_info:git:*' formats ' (%b)'
setopt PROMPT_SUBST
cluster_tag() {
    [[ "$KESTREL_CLUSTER" == "kestrel-stage" ]] || printf ' [%s]' "$KESTREL_CLUSTER"
}
PROMPT='%F{blue}%~%f%F{green}${vcs_info_msg_0_}%f%F{red}$(cluster_tag)%f %# '

# Key bindings: emacs-style editing, ctrl-r for history search
bindkey -e
bindkey '^R' history-incremental-search-backward

[ -r "$HOME/.zshrc.local" ] && source "$HOME/.zshrc.local"
