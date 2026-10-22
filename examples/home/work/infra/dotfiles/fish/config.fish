# config.fish — for the two of us on fish (Aiko and Jo); the zsh side is in zsh/kestrel.zsh.

set -gx KESTREL_HOME $HOME/work/kestrel
set -gx EDITOR nvim

function kr --description 'cd to a Kestrel repository'
    set -l repo kestrel
    test (count $argv) -gt 0; and set repo $argv[1]
    cd $HOME/work/$repo
end

function queue-depth --description 'the sync queue depth on prod'
    kubectl -n kestrel-prod exec deploy/sync-worker -- kestrel-api queue --depth $argv
end

abbr -a ks 'git -C $KESTREL_HOME status -sb'
abbr -a kl 'git -C $KESTREL_HOME log --oneline --graph -20'
