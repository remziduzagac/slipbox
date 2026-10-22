# The 2019 prototype

Notes on the first Kestrel: an Android app with a Ruby importer. Kept so nobody has to rediscover why it was
replaced. The code is in `legacy/`; the importer in [route_import.rb](../legacy/route_import.rb) is the interesting
part, and is also the part with the bug.

## What it was

- An Android client in Java that parsed GPX files on the phone (`legacy/GpxParser.java`).
- A Ruby script that imported GPX tracks into the first database.
- Haversine distance in C, because the first version of the app was a weekend experiment (`legacy/haversine.c`).

## Why it went

- One-shot sync: the phone uploaded everything, the server replaced everything. Two phones, one winner.
- No offline mode worth the name.
- Nobody but Sam could build it.

## What we kept

The idea that the route is the product. Everything else was rewritten for 2.0.
