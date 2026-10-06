# Glossary

Words we use, and what we mean by them. Alphabetical. Renamed from `docs/glossary-terms.md` on the
`docs/glossary-move` branch, with every link in the repository rewritten.

| Term | 意味 | Meaning |
| --- | --- | --- |
| Edge | エッジ | one street segment between two nodes in the graph |
| Op | 操作 | one edit in the sync log |
| Park | 保留 | take an op out of the queue and keep it for a human |
| Quiet score | 静けさ | 1 to 10: how calm a segment is for a rider |
| Region | 地域 | a tile set and its config, such as `nl` or `ch` |
| Route | ルート | an ordered list of waypoints and the path between them |
| Segment | 区間 | a row of `data/segments.csv`; an edge with its surveyed attributes |
| Share | 共有 | a signed, expiring link to a route |
| 京都 | Kyoto | where the Japanese-speaking half of the team sometimes works from |

## Notes on the table

The second column came from Aiko, who keeps the glossary in two languages so the Japanese-speaking contractors can
read it. Cells wrap between characters, not between words, when a column gets narrow.

For where these words show up in the system, see [the architecture](architecture.md).
