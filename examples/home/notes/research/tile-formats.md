---
title: Tile formats
tags: [research, maps, tiles]
---

# Tile formats

Which map tile format to serve, compared the way I compare things: by what the URL looks like, since that is what ends
up in the logs. The tile service is Malik's, the style is Tomás's, and the choice between them is mine to explain.

## The candidates

| Format | Template | Example query | Library path |
| --- | --- | --- | --- |
| Raster PNG | https://tiles.kestrel.example/png/{z}/{x}/{y}.png | ?style=light&scale=2 | /usr/local/lib/libpng16.so |
| Vector PBF | https://tiles.kestrel.example/v1/{z}/{x}/{y}.pbf | ?a=1&b=2&lang=en | /usr/local/lib/libprotobuf.so |
| MVT with extras | https://tiles.kestrel.example/mvt/{z}/{x}/{y}.mvt | ?layers=roads&fmt=pbf | /opt/mvt/mvt_encode.so |
| PMTiles archive | https://tiles.kestrel.example/all.pmtiles | Range: bytes=0-16383 | /srv/tiles/world_09.pmtiles |

## Why the URL matters

A tile URL is a template, and the template is the contract: `https://example.org/tiles/{z}/{x}/{y}.pbf` is not a link
to anything, it is a pattern the map library fills in. When I paste it into a note it must stay text. The same goes for
the query strings that carry the style, which are easy to break by wrapping them at the wrong `&`.

In the logs these paths and identifiers are one long word. They break after a slash, a dash, an underscore
or a dot: `/srv/tiles/world_2026_09.pmtiles` in a sentence is a single word that wants to break at four places, and
`kestrel-tiles-eu-west-1.example.internal` at five. Query strings break after a question mark or an ampersand:
`?style=light&scale=2&lang=en&labels=none&attribution=compact&format=pbf`.

## Autolinks

A bare address, https://tiles.kestrel.example/status, and one with www, www.kestrel.example/tiles, and one in angle
brackets, <https://tiles.kestrel.example/status?verbose=1>, and a mail address, <tiles@kestrel.example>.

## Notes from the pricing page

Copied from the tile service's pricing page and its footer, with the line starts as they came:

\* prices exclude VAT, and the free tier ends at 100,000 requests a month.

2026\. Q4 budget for the tile bill is Malik's open item, not mine.

\# of tiles in the EU archive: about 62 million, counted by Malik.

\> 95% of requests are served from the CDN cache, which is what keeps the bill where it is.

The footer's attribution is &copy; OpenStreetMap contributors, and the docs write &lt;tile&gt; where I would write a
placeholder, &amp; where a query string has an ampersand, and &#8212; for the long dash in the headings, with a
&nbsp; between the number and the unit.

## Sizes

| Format | Typical tile | Whole region (EU) | Cacheable |
| --- | ---: | ---: | :---: |
| PNG | 38 kB | 640 GB | yes |
| PBF | 9 kB | 70 GB | yes |
| PMTiles | n/a | 52 GB in one file | with ranges |

## Decision

Vector tiles, served from one PMTiles archive on the CDN, with the PNG path kept for the share preview image. Malik has
the migration plan.
