# ~/.profile: executed by the login shell (sh-compatible).
# Kestrel Labs developer baseline. Keep it small; put anything personal in ~/.profile.local.

# Tools installed by mise and by us
if [ -d "$HOME/.local/bin" ]; then
    PATH="$HOME/.local/bin:$PATH"
fi

if [ -d "$HOME/.cargo/bin" ]; then
    PATH="$HOME/.cargo/bin:$PATH"
fi

export PATH
export EDITOR=nvim
export VISUAL=nvim
export PAGER=less
export LESS="-FRX"

# Which cluster kubectl talks to by default. Production is never the default.
export KUBECONFIG="$HOME/.kube/config"
export KESTREL_CLUSTER="${KESTREL_CLUSTER:-kestrel-stage}"

# The shell you log in with reads this; zsh reads .zshrc afterwards.
if [ -n "$BASH_VERSION" ] && [ -f "$HOME/.bashrc" ]; then
    . "$HOME/.bashrc"
fi

[ -r "$HOME/.profile.local" ] && . "$HOME/.profile.local"
