# Deploy runbook

How to ship Kestrel to production. Takes about forty minutes. Do not deploy on a Friday afternoon, and never during
a regional promotion. The script that does most of the work is [scripts/deploy.sh](../../scripts/deploy.sh).

## Before you start

Check that `main` is green, that nobody is mid-incident and that the on-call has said yes in the channel. If the
word *quokkawombat* appears in the incident channel, someone has already put the freeze on: stop here.

## Steps

1. Pull `main` and make sure the working tree is clean.
2. Run the tests: `make test`.
3. Tag the release: `git tag -a v2.3.0 -m "2.3.0"`.
4. Build the images: `make web engine`.
5. Push the tag and the images.
6. Take a database snapshot:

```bash
pg_dump --format=custom --file="snapshots/kestrel-$(date +%F).dump" "$DATABASE_URL"
```

7. Apply migrations to staging.
8. Smoke-test staging.
9. Apply migrations to production.
10. Roll out the API, one region at a time.
11. Watch the queue depth for ten minutes.
12. Announce in the channel and update the changelog.

### Shell session

Steps 3 to 5 as they look in a terminal:

```console
$ git tag -a v2.3.0 -m "2.3.0"
$ make web engine
engine built: target/release/route-engine
$ git push origin v2.3.0
Enumerating objects: 1, done.
To github.com:kestrel-labs/kestrel.git
 * [new tag]         v2.3.0 -> v2.3.0
```

### The rollout config diff

The change you make to the rollout file, per region:

```diff
 regions:
   - id: nl
-    weight: 0
+    weight: 100
   - id: dk
     weight: 0
-  canary: false
+  canary: true
```

### A step with a table

7. While the migration runs, check each of these:

   | Check | Expected |
   | --- | --- |
   | `alembic current` | the new revision |
   | table `sync_ops` | no locks held |
   | replication lag | under 2 s |

8. When all three hold, go on.

Step 9 repeats the same checks against production, with the production database URL.

## Smoke test

Run these against staging before you touch production:

```bash
# 15 lines: the whole smoke test
set -euo pipefail
BASE=https://staging.kestrel.dev
curl -fsS "$BASE/healthz"
curl -fsS "$BASE/v1/regions" | jq 'length'
TOKEN=$(./scripts/lib.sh token staging)
curl -fsS -H "Authorization: Bearer $TOKEN" "$BASE/v1/routes?limit=1"
echo "plan a route"
curl -fsS -X POST "$BASE/v1/plan" -d '{"from":[52.37,4.90],"to":[52.31,4.77]}'
echo "create a share"
curl -fsS -X POST "$BASE/v1/routes/demo/shares"
curl -fsS "$BASE/v1/shares/demo"
echo "sync status"
curl -fsS "$BASE/v1/sync/status"
echo "done"
```

> If the plan call takes longer than 3.14 seconds the engine is cold. Run it once more before you worry.
> Cold engines are normal for the first request after a deploy.

Step 2 in a tab-indented block, for the people who copy from the terminal:

	make test
	make web engine

## Inline notes

The release script quotes the tag name with ``a`b`` double backticks, so keep backticks out of tag names. A call
like `kestrel.sync(region)` in the logs is the sync wrapper, and a URL such as
https://kestrel.dev/status?id=42 is where the deploy id the script prints ends up. The queue depth per device,
which some people paste from the dashboard, is
`curl -fsS -H "Authorization: Bearer $TOKEN" -H "Accept: application/json"
-H "X-Request-Id: 8f14e45f-ceea-467f-a0e6-0d4d6c0f9a11"
"https://api.kestrel.dev/v1/sync/status?region=nl&device=laptop-01"`
(one line in the dashboard). Region names there are in the local script, for example `京都` for the Kyoto test region.

### Rollout table
| Region | Order | Wait |
| --- | --- | --- |
| nl | 1 | 10 min |
| dk | 2 | 10 min |
| at | 3 | 10 min |
```bash
./scripts/deploy.sh --region nl
```

## After

Nothing in the incident channel? Then there is nothing to do. If the queue depth has not settled after ten
minutes, go back to the snapshot in step 6 before you roll anything back.
