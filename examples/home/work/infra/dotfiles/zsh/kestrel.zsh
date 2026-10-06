# kestrel.zsh — the team's shared shell helpers, sourced from ~/.zshrc (see dotfiles/.zshrc).

export KESTREL_HOME="$HOME/work/kestrel"

# Jump to a repository: `kr product`, `kr infra`, `kr` alone for the app.
kr() { cd "$HOME/work/${1:-kestrel}" || return; }

# The sync queue's depth on prod, the number Malik watched for an hour on 22 September.
queue-depth() {
  kubectl -n kestrel-prod exec deploy/sync-worker -- kestrel-api queue --depth "${@}"
}

# A route's planned length, from the CLI the route engine ships.
route-length() { "$KESTREL_HOME/target/release/kestrel-route" length --geojson "$1"; }

alias ks='git -C "$KESTREL_HOME" status -sb'
alias kl='git -C "$KESTREL_HOME" log --oneline --graph -20'
