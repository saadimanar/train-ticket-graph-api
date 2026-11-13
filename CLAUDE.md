# Project context

Home exercise for a backend role at Backslash (application security company).

## Task
Load `data/train-ticket-graph.json` (a graph of the Train Ticket microservices)
and build a basic query engine with a REST API on top of it.

- The API returns a graph structure that is easy to render in a client.
- Filter routes between services by:
  1. Routes that start in a public service (`publicExposed: true`)
  2. Routes that end in a sink (kind `rds` / `sql`)
  3. Routes that have a vulnerability in at least one node
- The API must be generic so new filters can be added easily.

Deliverables: a README explaining the design (decisions, assumptions)
and a git repo with the implementation.

## Data notes
- `nodes`: services plus infrastructure (`prod-postgresdb` is kind `rds`, `prod-sqs` is kind `sqs`).
- `edges[].to` is usually an array but can be a single string.
- `assurance-service` is referenced in edges but missing from `nodes`.
- `rds`/`sqs` nodes have no `publicExposed`/`language`/`path`; most services have no `vulnerabilities`.
- No cycles in this data, but the traversal should still handle cycles.
- With this data, "starts public AND ends in sink" returns no routes. This is expected, not a bug.

## Open design questions (to decide together)
- What counts as a route? (complete paths to a leaf vs. every subpath; are single-node routes valid?)
- Traversal approach (DFS vs. BFS, recursion vs. explicit stack) and cycle handling
- How multiple filters combine (AND only, or also OR?)
- Filter design: how a filter is defined and registered so new ones are easy to add
- Can filters also prune the search early (e.g. start only from public nodes)?
- API shape: endpoints, query parameters, response format for a client to render
- Precompute all routes at startup vs. compute per request
- How to handle bad data (missing nodes, string vs. array `to`)

## Stack
Node 22, TypeScript (strict), Express, Zod, Vitest + supertest.

## How I want to work
We design the system together before writing code. For each design question,
present 2–3 options with their trade-offs and a recommendation, then wait for
my decision. Once a decision is made, record it in docs/DECISIONS.md with a
short reason. Implement one piece at a time and explain the key choices.