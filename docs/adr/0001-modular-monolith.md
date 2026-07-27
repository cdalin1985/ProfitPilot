# ADR 0001: Begin with a modular monolith

- Status: Accepted
- Date: 2026-07-27

## Context

Profit Pilot needs independently scalable publication, redirect, ingestion, and analytics workloads, but premature service decomposition would slow delivery and make tenant authorization inconsistent.

## Decision

Use a monorepo and modular control plane:

- Next.js web application.
- Fastify control-plane API.
- Shared contracts, authorization, and database packages.
- Independently deployed workers when durable workflows are introduced.
- Separate redirect and event-ingestion services before public traffic is enabled.

Module boundaries are expressed in package APIs and ownership, not network calls. A module becomes a service only when its availability, scaling, security, or data-isolation profile requires independent operation.

## Consequences

- Cross-cutting tenant controls remain reusable and testable.
- Early deployment and local development stay comprehensible.
- Hot-path redirect and analytics workloads can be extracted without rewriting product modules.
- Package boundaries must be enforced in CI to prevent accidental coupling.
