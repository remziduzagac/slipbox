# ADR 3: Share links are signed and expire

- Status: accepted
- Date: 2026-09-02
- Deciders: Tomás Ruiz, Sam Rivera, Priya Nair

## Context

Riders asked to send a route to a friend without the friend having an account. The first idea was a plain link with
the route id in it. Route ids are guessable in sequence in the old API, and a link that never stops working is a
privacy leak waiting for a screenshot.

## Decision

Share links carry the route id, an expiry time and an HMAC signature over both, made with a per-environment secret.
The server refuses a link whose signature does not match or whose time has passed. The default lifetime is 72 hours; the
owner can stop sharing at any time, which marks the share revoked in the database. ^decision

The feature itself, with the screens and the API, is described in [route sharing](../features/route-sharing.md).

## Consequences

- A copied link stops working by itself, which the share dialog says in plain words.
- Rotating the secret invalidates every link at once. That is the incident switch, not a feature.
- The old unsigned `?route=` links are read-only and stop working on 2026-12-31.

## Rejected

- Long random tokens stored in a table: one more table and one more lookup per view, for the same security.
- Public routes: a different product.
