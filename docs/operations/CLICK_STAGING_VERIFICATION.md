# Signed-click staging verification

1. Inject independent 32-byte-or-longer signing, privacy-HMAC, and event-auth keys through the deployment secret manager. Never commit or print them.
2. Apply migration `0009_signed_click_attribution.sql` with the migration role.
3. Deploy event ingestion on a private endpoint, then the redirect service on the public redirect domain.
4. Create a link from a current approved revision whose source product contains an HTTPS Awin feed link.
5. Confirm a normal GET returns `302` to exactly the stored destination with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow`.
6. Alter one token byte and confirm a neutral `404`; revoke the link and confirm `410`.
7. Confirm the first browser click is qualified, a second within 30 minutes is duplicate, and HEAD, prefetch, and crawler requests are bot-classified.
8. Run simultaneous duplicate requests and confirm exactly one qualified event.
9. Confirm cross-tenant reads and writes fail, and application-role update/delete of click events affects no rows.
10. Inspect logs and traces to prove they contain no token, destination URL, raw IP, full user agent, or event-auth signature.

Do not enable public traffic until redirect latency/load targets, key rotation, ingestion-loss alerting, and legal approval of the tracking disclosure are complete.
