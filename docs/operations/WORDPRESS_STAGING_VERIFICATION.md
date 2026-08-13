# WordPress staging verification

Use a dedicated non-production WordPress site and integration user. ProfitPilot creates drafts only; this verification must not target a production publication workflow.

## Preconditions

- WordPress REST API is available over public HTTPS.
- The site URL is canonical and does not redirect.
- A dedicated user can create and edit posts but cannot administer plugins, themes, or users.
- That user has a WordPress Application Password.
- The credential is stored in AWS Secrets Manager as JSON:

```json
{
  "username": "profit-pilot-integration",
  "applicationPassword": "xxxx xxxx xxxx xxxx xxxx xxxx"
}
```

Store only the Secrets Manager identifier in ProfitPilot. Never place the password in source control, deployment variables, issue comments, or the database.

## 1. Read-only connection test

The connection-test route accepts the credential only for this immediate verification and does not persist it.

```bash
curl --fail-with-body \
  --request POST \
  --url "$PROFIT_PILOT_API_URL/v1/workspaces/$WORKSPACE_ID/connections/wordpress/test" \
  --header "Authorization: Bearer $PROFIT_PILOT_ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data "{\"siteUrl\":\"$WORDPRESS_SITE_URL\",\"username\":\"$WORDPRESS_USERNAME\",\"applicationPassword\":\"$WORDPRESS_APPLICATION_PASSWORD\"}"
```

Expected result: HTTP 200 with `provider: wordpress`, `status: verified`, and the dedicated integration user's ID and name.

## 2. Save the verified destination

```bash
curl --fail-with-body \
  --request PUT \
  --url "$PROFIT_PILOT_API_URL/v1/workspaces/$WORKSPACE_ID/destinations/wordpress" \
  --header "Authorization: Bearer $PROFIT_PILOT_ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data "{\"name\":\"Staging WordPress\",\"siteUrl\":\"$WORDPRESS_SITE_URL\",\"secretReference\":\"$WORDPRESS_SECRET_REFERENCE\"}"
```

Record the returned destination `id` as `WORDPRESS_DESTINATION_ID`.

## 3. Create and replay a draft

Use a content item whose current revision has passed every mandatory validator and has an immutable human approval action.

```bash
export PUBLICATION_IDEMPOTENCY_KEY="$(uuidgen)"

curl --fail-with-body \
  --request POST \
  --url "$PROFIT_PILOT_API_URL/v1/workspaces/$WORKSPACE_ID/content/$CONTENT_ID/publications/wordpress-draft" \
  --header "Authorization: Bearer $PROFIT_PILOT_ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --header "Idempotency-Key: $PUBLICATION_IDEMPOTENCY_KEY" \
  --data "{\"destinationId\":\"$WORDPRESS_DESTINATION_ID\",\"revisionId\":\"$REVISION_ID\"}"
```

Expected first result: HTTP 201, `status: draft_created`, and `replayed: false`. Confirm in WordPress that the post status is Draft and that the disclosure, headings, and grounded body blocks render correctly.

Repeat the exact request with the same idempotency key. Expected replay result: HTTP 200 with the same publication ID, remote post ID, and slug, plus `replayed: true`. No second WordPress post may exist.

## Release evidence

Attach these non-secret results to the staging release record:

- connection test timestamp and integration user ID;
- ProfitPilot destination ID;
- content and revision IDs;
- publication ID, remote post ID, and deterministic slug;
- screenshot showing WordPress Draft status;
- successful replay response and confirmation that only one remote post exists;
- audit events for destination verification, publication start, and draft completion.

Rotate the staging Application Password after testing if it was exposed to any local shell history. Production activation remains blocked until this contract test, cross-tenant database suite, and backup/rollback checks pass in the staging environment.
