# infra

How Kestrel Labs runs Kestrel: the Kubernetes manifests, the Helm chart, the Terraform state backend, and the config
files the platform keeps in one place. The application lives in [kestrel](../kestrel/README.md); what we promise
customers lives in [product](../product/README.md). This repository is only about where the code runs.

## Clusters

| Cluster          | Region      | What runs there                                     | Who can deploy       |
| ---------------- | ----------- | --------------------------------------------------- | -------------------- |
| `kestrel-prod`   | `eu-west-1` | API, sync worker, tile server, the route engine     | Priya, Malik, Aiko   |
| `kestrel-stage`  | `eu-west-1` | the same, one replica each, a copy of last night's  | anyone on the team   |
| `kestrel-lab`    | `eu-west-1` | experiments; wiped every Sunday at 03:00            | anyone on the team   |

The manifests under `k8s/` are the source of truth for the first two. Nothing is applied by hand: if `kubectl get` and
this repository disagree, the repository wins and the cluster is wrong.

## What is where

- `k8s/` — plain manifests, one file per service. Several objects to a file, separated by `---`. The API is
  [api.yaml](k8s/api.yaml), the tile server is [tiles.yaml](k8s/tiles.yaml).
- `k8s/workers/` — the background workers. The sync worker moved here from `k8s/` on 2026-09-23, the day after the
  incident, when we split the workers from the request path: [the sync worker](/k8s/workers/sync-worker.yaml).
- `helm/kestrel/` — the chart that stamps out a whole stack for a preview environment.
- `terraform/` — the state backend and its settings; the cloud resources themselves are in a private repository.
- `config/` — settings for the things that are not Kubernetes: the load balancer, the archive job, nginx on the
  old bastion, kernel parameters. `config/local/` is for per-person overrides and is never committed with content.
- `scripts/` — `rotate-certs.sh` and friends. The CA bundle `certs/ca.pem` that `rotate-certs.sh` uses is fetched at
  deploy time and never committed; ask Malik for access.
- `dotfiles/` — shell setup and editor settings we all copy. See below.

## How to deploy

1. Merge to `main`. CI renders the manifests and runs `kubeconform` and `yamllint` (the pipeline lives with the
   cluster tooling, not in this repository).
2. The stage cluster picks the change up within five minutes.
3. Watch the dashboard for a quarter of an hour, then promote: `make promote` from a clean checkout of `main`.
4. For anything that touches the sync worker, read
   [the sync queue runbook](../kestrel/docs/runbooks/sync-queue.md) first. Since 2026-09-22 we also drain the queue
   before a rollout, with `scripts/drain-queue.sh` in the kestrel repository.

The deploy steps for the application itself are in `slipbox://kestrel/docs/runbooks/deploy.md`.

A deploy is frozen between 18:00 and 08:00 Central European time, and all day on Fridays unless Priya says otherwise.
The banner `k8s/motd.yaml` says so when you connect to the cluster.

## Dotfiles for developers

`dotfiles/` holds the shell setup we agree on (`.zshrc`, `.bashrc`, `.profile`) and the team's slipbox settings.
Copy, do not link: your machine will have things ours does not. The slipbox part has its own page,
[slipbox setup](dotfiles/slipbox/README.md).

## Working in this repository with slipbox

slipbox treats this folder as one project because of its `.git`: the repository is its root, and `/k8s/...` in a link
means `k8s/` here, wherever the file linking sits. Your last place in each file, the open tabs and the layout are kept
per root, so opening a file in this repository from anywhere else brings you back to where you were. A plain folder
you open without such a marker keeps its own state in the same way, keyed by the folder.

## Who to ask

- Cluster access and certificates: Malik Haddad.
- Anything about releases and freezes: Priya Nair.
- The sync worker and its queue: Aiko Tanaka.
