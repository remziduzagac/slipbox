# ~/.bashrc — Kestrel Labs developer baseline, and the bits zsh shares (~/.zshrc sources this file).
# Keep everything here POSIX-safe: no zsh-only syntax. Local additions go in ~/.bashrc.local, sourced at the end.

# Not an interactive shell: nothing to set up
case $- in
    *i*) ;;
    *) return 0 2>/dev/null || exit 0 ;;
esac

# Tools installed by mise and by us
case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) PATH="$HOME/.local/bin:$PATH" ;;
esac
export PATH

# History (bash; zsh sets its own)
if [ -n "$BASH_VERSION" ]; then
    HISTSIZE=50000
    HISTFILESIZE=50000
    HISTCONTROL=ignoredups:erasedups
    shopt -s histappend
fi

# Aliases
alias k='kubectl'
alias kns='kubectl config set-context --current --namespace'
alias kgp='kubectl get pods -o wide'
alias kl='kubectl logs --tail=200 -f'
alias gs='git status -sb'
alias gl='git log --oneline --graph --decorate -20'
alias ll='ls -lah'

# Switch cluster for this shell only
kc() {
    case "$1" in
        prod|stage|lab) export KESTREL_CLUSTER="kestrel-$1" ;;
        *) echo "usage: kc prod|stage|lab (now: $KESTREL_CLUSTER)" >&2; return 1 ;;
    esac
    kubectl config use-context "$KESTREL_CLUSTER"
}

[ -r "$HOME/.bashrc.local" ] && . "$HOME/.bashrc.local"
