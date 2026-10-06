# Theme showcase

Tomás's review page for the themes: every colour role appears at least once, so a new theme can be judged in one
screen sweep. Real content, because contrast looks different on real text. See [the QA plan](plan%20(v2).md).

## Headings

# H1 band
## H2 band
### H3 band
#### H4 band
##### H5 band
###### H6 band

### With `inline code` in it

### With **bold** and *emphasis* in it

### With a [link](../architecture.md) in it

### With an ![image alt](../../public/logo.svg) in it

### With a #tag in it

## Inline

Plain text, **bold**, *italic*, ***both***, ~~struck through~~, `inline code`, and **bold with `code` inside** next to
`code with **bold** inside`. Contrast between bold text and inline code is what this paragraph is for.

A [resolved link](../architecture.md), a [broken link](missing-page.md), an [external link](https://example.org), an
[anchor](#inline) and a [link with a title](../sync.md "How sync works"). A footnote reference[^1] and a second[^note].

Tags: #routing #ux/design #q4-2026 and a line with a hash in the middle, c#, which is not one.

Tasks:

- [ ] open task
- [x] done task, with ~~a struck word~~
- [ ] a task with a tag #review and a [link](../sync.md)

Inline HTML that renders as its text: press <kbd>Ctrl</kbd>+<kbd>S</kbd>, x<sup>2</sup>, H<sub>2</sub>O,
a <mark>mark</mark>, a <span style="color: red">styled span</span>, <b>b</b>, <i>i</i> and <u>u</u>.

An inline comment <!-- this part is hidden --> in a paragraph, and one that
<!-- spans
two lines --> goes on after it.

[^1]: The first footnote, with a [link](../architecture.md) in it.
[^note]: A named footnote.

## Callouts


> [!note] Routes are saved per device
> Until the sync queue drains, a saved route exists only on the device that made it.

> [!abstract] What 2.3 ships
> Route sharing, the offline sync rewrite, and tile sets for Denmark and Austria.

> [!summary] Release in one paragraph
> 2.3 went out on 2026-09-30 after one slip: the sync queue stalled on an op the server kept rejecting on 09-22.

> [!tldr] Too long, did not read
> Share a route with the Share button; the link lasts 72 hours.

> [!info] Tiles are monthly
> The tile sets are rebuilt from OpenStreetMap on the first of each month.

> [!todo] Before the next release
> Add the Austrian tile set to the staging rollout and re-run the smoke test.

> [!tip] Hold Shift to add a waypoint
> Clicking the map with Shift down adds a waypoint without moving the others.

> [!hint] Try the quiet layer
> The quiet score colours every street from 1 (busy) to 10 (calm).

> [!important] Tokens expire
> Share links stop working after 72 hours, and the owner is not told when they do.

> [!success] Sync is caught up
> Queue depth is back to zero on every device we watch.

> [!check] Pre-deploy checklist passed
> Main is green, nobody is mid-incident, the on-call said yes.

> [!done] Route engine moved to Rust
> The Python cost model was deleted in #401.

> [!question] Does a revoked link still show the route?
> No: the server answers 404 as soon as the share is deleted.

> [!help] Where do I report a bad street?
> Use Report on the segment; Jo triages them on Mondays.

> [!faq] Why 72 hours?
> Long enough for a weekend trip, short enough that old links do not linger.

> [!warning] Tiles for Austria expire on 2026-10-31
> The June tile set is dropped from the server then; rebuild before the date.

> [!caution] Do not deploy on a Friday afternoon
> The on-call has the weekend; a Friday rollout makes it theirs.

> [!attention] Freeze in effect
> If the incident channel says freeze, stop the rollout where it is.

> [!failure] Rollout stopped in dk
> Replication lag stayed above 2 s, so the migration was rolled back.

> [!fail] Smoke test failed
> The plan call returned 502 on staging; the engine had not warmed up.

> [!missing] No altitude data for ch
> The Swiss tile set has no elevation yet, so climbs show as flat.

> [!danger] Never run migrations on production by hand
> Use scripts/deploy.sh, which takes the snapshot first.

> [!error] Plan failed: no route found
> The start or end is further than 200 m from any street segment.

> [!bug] Elevation graph jumps at tile edges
> Seen on the Utrecht ring; the grade is computed per tile, not per edge.

> [!example] A shared link
> https://kestrel.dev/s/8fj2k?expires=1790000000&sig=b21c9e

> [!quote] Jo, after the incident
> "The queue stalled and nobody told the riders; they only saw their route not saving."

> [!cite] Source
> Incident review, 2026-09-24, section 2.

### Unknown kinds and odd spellings

> [!whatever] An unknown kind
> Falls back to the note style.

> [!TiP] Mixed case
> Case does not matter.

> [!my-kind] A hyphenated kind
> Unknown, so plain.

> [!a_b] With an underscore
> Also unknown.

> [!x] Too short
> Four unknown kinds is enough.

### Foldable

> [!note]+ Open by default
> Visible body.

> [!note]- Closed by default
> Hidden body.

> [!note]+
> No title, open.

> [!note]-
> No title, closed.

## Code in many languages


```typescript
const route: string[] = [];
```

```ts
type A = number;
```

```tsx
const X = () => <div />;
```

```javascript
let a = 1;
```

```js
const expiresAt = () => Date.now() + 72 * 3600_000;
```

```python
def quiet_score(segment):
    return segment.quiet_score
```

```py
print(f"{len(routes)} routes shared")
```

```rust
fn edge_cost(len_m: f32, grade: f32) -> f32 { len_m * (1.0 + grade.max(0.0)) }
```

```rs
let zoom = 11;
```

```go
func main() { fmt.Println("tiles ok") }
```

```bash
make web engine
```

```sh
ls -la data/
```

```zsh
print -r -- $KESTREL_TILES_DIR
```

```lua
local region = "nl"
```

```yaml
services:
  redis:
    image: redis:7
```

```yml
- nl
- dk
- at
```

```toml
[map]
zoom = 11
```

```json
{"enabled": true, "rollout": 0.25}
```

```css
.route-line { stroke: #c83c32 }
```

```html
<p class="share-note">Link expires in 72 hours</p>
```

```sql
SELECT count(*) FROM sync_ops WHERE acked_at IS NULL;
```

```diff
- weight: 0
+ weight: 100
```

```markdown
# Route sharing
```

```haskell
main = print (length ["nl", "dk", "at"])
```

```foo
note pasted by a rider, tagged with a language we do not have
```

```text
route: Canal ring, 42.5 km
```

```plaintext
route: Dune crossing, 61.0 km
```

```
no language at all
```

~~~python
# a tilde fence
x = [i for i in range(3)]
~~~

## HTML blocks

<div class="note">
A div, shown verbatim and dim.
</div>

<details>
<summary>A details block</summary>
Content.
</details>

<table>
  <tr><td>a</td><td>b</td></tr>
</table>

<p align="center">A centred paragraph</p>

<img src="../../public/logo.svg" alt="logo" width="40">

<pre>
  preformatted   text
</pre>

<style>
  body { color: red; }
</style>

<![CDATA[ raw data ]]>

<?php echo "hi"; ?>

<!DOCTYPE html>

<script>
  document.write("[31mred[0m");
</script>

## Embeds

![Components](../architecture.md#components)

![Decision](../adr/0003-sharing-links.md#^decision)

## Comments

<!--
# A heading inside a comment
---
- a list in a comment
-->

Visible between comments.

<!-- one-line comment -->

Last visible line. The comment below never closes, and hides the rest of the file.

<!-- never closed
and this text is hidden too
