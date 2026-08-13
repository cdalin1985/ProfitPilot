# ADR 0006: Production overview read model

- Status: accepted
- Date: 2026-08-13

## Decision

The authenticated overview is assembled by one tenant-scoped database repository and exposed by `GET /v1/workspaces/:workspaceId/overview`. The route requires `analytics:read`; the repository also enters the existing organization/workspace transaction context, so authorization and row-level tenant isolation are both enforced.

Metrics use these definitions:

| Field                   | Definition                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qualified clicks        | PP-109 `click_events` classified `qualified`, with `occurred_at` in the trailing 30 days                                                                                               |
| Commission              | Unavailable until an affiliate-network transaction ledger is ingested; the API returns `commissionAvailable: false` and the UI renders an em dash                                      |
| Content awaiting review | Current `content_items.status = 'in_review'`                                                                                                                                           |
| Publishing health       | Successful terminal publication outcomes divided by all terminal outcomes created in the trailing 30 days; unavailable when no terminal outcome exists                                 |
| Opportunity trend       | Latest score compared with the preceding score for the same product; a change of at least five points rises/falls, otherwise steady; new products and products without history are new |

The response also includes the five highest-priority queue entries, the latest opportunity per available product, and current content pipeline counts. Queue links are server-produced application paths; relative times are calculated against the response's `generatedAt` snapshot.

## Query and operational notes

Migration `0010_production_overview.sql` adds tenant-leading indexes for click-window counts, current status counts, opportunity history, publication outcomes, and reconnect queues. The qualified-click index is partial to keep the high-volume attribution path compact. Run normal migration deployment before releasing the API and web application.

No cache is introduced in this slice. This keeps tenant and authorization semantics explicit and avoids serving stale operational queues. Revisit a pre-aggregated read model after production query plans and volume justify it.

## Consequences

Development may still use validated fixtures when no API URL is configured. Production never substitutes fixtures. Missing commission data and absent publication samples are represented as unavailable, not as zero performance. Adding commission requires a durable, idempotent network-transaction source and a subsequent contract version rather than inferring revenue from product commission rates.
