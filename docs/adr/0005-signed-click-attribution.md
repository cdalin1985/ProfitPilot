# ADR 0005: Signed immutable redirects and minimized click ingestion

- Status: Accepted
- Date: 2026-08-13

## Decision

Affiliate destinations are copied only from tenant-scoped network-feed product records into immutable `affiliate_links`. Public URLs contain a bounded HMAC-SHA256 token with the link and tenant identifiers, key ID, version, and absolute expiry; they never contain a destination URL. Redirects verify the token before tenant-scoped lookup and fail closed for altered, expired, or revoked links.

The public redirect and internal event-ingestion workloads are separate deployables. A valid navigation is not blocked by analytics failure. Redirects send a timestamped HMAC-authenticated event envelope to ingestion. Ingestion is idempotent by event UUID, keeps click events append-only, marks known bots and prefetches, and qualifies at most one human click per link and privacy-preserving visitor hash in a rolling 30-minute window.

Raw IP addresses, full user agents, cookies, referrers, destination URLs, and signed tokens are excluded from click events and logs. Key rotation retains old verification keys until their signed links expire.
