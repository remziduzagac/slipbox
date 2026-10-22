# ADR 2: The route engine in Rust

- Status: accepted
- Date: 2026-01-27
- Deciders: Sam Rivera, Priya Nair

## Context

The 1.x route search was Python, and a 60 km route in the Alps took eleven seconds. The Python cost model was also
the place where every bug about bike lanes lived, because the costs were mixed up with the graph walk.

## Decision

Write the search in Rust, in `crates/route-engine`, and call it from the API as a subprocess for now and as a library
later. See [the crate manifest](/crates/route-engine/Cargo.toml) for its dependencies. This ADR is itself at
[/docs/adr/0002-route-engine-in-rust.md](/docs/adr/0002-route-engine-in-rust.md), which is the form we use when a
link would otherwise climb many folders.

The search is A* over a graph of street segments. The cost of an edge comes from one function,
`crate::graph::edge_cost`, which takes the segment and a rider profile and returns a number. Everything the product
wants to tune (quiet streets, grade, surface) is an input to that function and nowhere else.

## Names

The crate and its files follow Rust's conventions: `snake_case` for functions, modules and file names, so
`route_engine::graph::edge_cost_with_grade_penalty` is a function, and `build.rs` generates `tables/cost.generated.rs`.
Config files in the repository use dots where Rust would use underscores, as in `config/app.toml`, so the one
thing to remember is that `a.b.c.d` in a config path means nesting and `a_b_c_d` in a Rust path means one name.

## Consequences

- Searches are about 40 times faster on the same hardware.
- Two languages to build in CI (`cargo build --locked` next to `npm ci`).
- Fewer people can review engine changes. We pair on them to spread that.
- The cost model is testable on its own, with a table of segments and expected costs.
