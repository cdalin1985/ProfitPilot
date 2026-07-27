# Initial threat model

## Protected assets

- Tenant product, content, attribution, conversion, and billing data.
- Affiliate-network, WordPress, identity, AI-provider, and billing credentials.
- Published links and redirect integrity.
- Approval, audit, and evidence history.
- Platform availability and provider spending limits.

## Trust boundaries

1. Browser to web application.
2. Web application to control-plane API.
3. API and workers to PostgreSQL, Redis, object storage, and workflow services.
4. Platform to Awin, CJ, Amazon, WordPress, Stripe, OpenAI, and email providers.
5. Public redirect and ingestion endpoints to the analytics plane.
6. Internal support application to customer data.

## Priority threats and controls

| Threat                                  | Primary controls                                                                            | Verification                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Cross-tenant access                     | OIDC membership binding, typed context, handler checks, PostgreSQL RLS                      | Negative integration suite across all resource routes |
| Credential disclosure                   | AWS Secrets Manager, envelope encryption, write-only UI, log redaction                      | Secret scanning and redaction tests                   |
| SSRF through WordPress or merchant URLs | HTTPS-only allowlists, DNS and IP validation, private-range blocking, redirect revalidation | SSRF corpus and DNS-rebinding tests                   |
| Open redirect or link tampering         | Signed immutable link records, destination allowlists, scheme validation                    | Redirect property tests                               |
| Webhook forgery or replay               | Signature verification, timestamp windows, idempotency ledger                               | Provider fixture tests                                |
| Prompt injection through feeds or pages | Treat external content as untrusted data, schema-constrained generation, tool allowlists    | Adversarial evaluation suite                          |
| Unsupported or fabricated claims        | Evidence graph, claim validators, locked disclosures, human approval                        | Golden-set factuality and policy evaluations          |
| Noisy-neighbor resource exhaustion      | Tenant quotas, rate limits, fair queues, cost budgets, circuit breakers                     | Multi-tenant load tests                               |
| Privileged support abuse                | Separate identity boundary, just-in-time grant, reason and ticket, complete audit           | Quarterly access review                               |
| Dependency compromise                   | Lockfile, automated updates, provenance-aware CI, SAST and image scanning                   | CI release gate                                       |

## Abuse cases

- A customer attempts to scrape an entire affiliate catalog beyond network limits.
- A customer generates or publishes deceptive health, financial, or regulated claims.
- A customer tries to use the redirect service as a phishing or malware redirector.
- A compromised destination attempts to coerce the publisher into leaking credentials.
- A malicious feed places instructions in product descriptions to influence the AI system.
- A high-volume tenant intentionally consumes shared generation or publishing capacity.

## Release-blocking tests

- Any successful cross-tenant read or mutation.
- Any credential in logs, client bundles, exports, or error responses.
- Any public redirect to a non-approved destination.
- Any publication with a missing required disclosure or failed policy check.
- Any production execution path that falls back to development identity or seed data.
