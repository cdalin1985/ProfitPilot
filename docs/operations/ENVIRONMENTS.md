# Environment and account requirements

## Account topology

Use one AWS Organization with separate accounts:

- Security and log archive.
- Shared services.
- Development.
- Staging.
- Production.

The production account does not share databases, queues, encryption keys, secrets, or application roles with development or staging.

## Primary region

`us-east-1` is the initial primary region. Backups are copied to a second U.S. region after the production data-classification review.

## External systems

The following account work requires an authorized human owner:

- AWS Organization and billing.
- DNS registrar and production domain.
- WorkOS organization.
- Stripe account and bank/tax verification.
- OpenAI production project and spend controls.
- Awin publisher approval and API token.
- WordPress destination and application password.
- Monitoring, paging, support, and transactional-email accounts.

No raw credential should be sent through chat, issue comments, CI configuration, or source control.

## Promotion

1. Pull request checks.
2. Ephemeral or development validation.
3. Staging deployment and database migration check.
4. Automated smoke, tenant-isolation, and connector contract tests.
5. Production approval for database, IAM, networking, or customer-visible behavior.
6. Progressive deployment with automatic rollback thresholds.

Database migrations must be backward compatible with the currently deployed application. Destructive cleanup occurs only in a later release after usage verification.
