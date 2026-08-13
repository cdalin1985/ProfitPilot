import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  completeOnboarding,
  recordOnboardingIdentity,
  replayCompletedOnboarding,
  reserveOnboarding,
} from "./onboarding.js";
import {
  completeWordPressPublication,
  failWordPressPublication,
  reserveWordPressPublication,
} from "./publication.js";
import { closeDatabase } from "./database.js";

const adminUrl = process.env.DATABASE_ADMIN_URL;
const applicationUrl = process.env.DATABASE_INTEGRATION_URL;
const integrationAvailable = Boolean(adminUrl && applicationUrl);
if (applicationUrl) {
  process.env.DATABASE_URL = applicationUrl;
}

const organizationA = "018f6d4d-74d4-7c18-a1d4-bb620a63c001";
const organizationB = "018f6d4d-74d4-7c18-a1d4-bb620a63c002";
const workspaceA = "018f6d4d-74d4-7c18-a1d4-bb620a63c101";
const workspaceB = "018f6d4d-74d4-7c18-a1d4-bb620a63c102";
const connectionA = "018f6d4d-74d4-7c18-a1d4-bb620a63c111";
const connectionB = "018f6d4d-74d4-7c18-a1d4-bb620a63c112";
const generationRequestA = "018f6d4d-74d4-7c18-a1d4-bb620a63c121";
const generationRequestB = "018f6d4d-74d4-7c18-a1d4-bb620a63c122";
const contentItemA = "018f6d4d-74d4-7c18-a1d4-bb620a63c131";
const contentItemB = "018f6d4d-74d4-7c18-a1d4-bb620a63c132";
const contentRevisionA = "018f6d4d-74d4-7c18-a1d4-bb620a63c141";
const contentRevisionB = "018f6d4d-74d4-7c18-a1d4-bb620a63c142";
const reviewActionA = "018f6d4d-74d4-7c18-a1d4-bb620a63c151";
const reviewActionB = "018f6d4d-74d4-7c18-a1d4-bb620a63c152";
const destinationA = "018f6d4d-74d4-7c18-a1d4-bb620a63c161";
const publicationRequestA = "018f6d4d-74d4-7c18-a1d4-bb620a63c162";
const userA = "018f6d4d-74d4-7c18-a1d4-bb620a63c301";
const userB = "018f6d4d-74d4-7c18-a1d4-bb620a63c302";
const actorA = "user_integration_a";
const actorB = "user_integration_b";
const identityProviderOrganizationA = "org_integration_a";
const identityProviderOrganizationB = "org_integration_b";
const onboardingRequestA = "018f6d4d-74d4-7c18-a1d4-bb620a63c401";
const onboardingRequestC = "018f6d4d-74d4-7c18-a1d4-bb620a63c402";
const actorC = "user_integration_onboarding";
const identityProviderOrganizationC = "org_integration_onboarding";
const identityProviderMembershipC = "om_integration_onboarding";

const admin = adminUrl ? postgres(adminUrl, { max: 1 }) : undefined;
const application = applicationUrl ? postgres(applicationUrl, { max: 1 }) : undefined;

describe.skipIf(!integrationAvailable)("PostgreSQL tenant isolation", () => {
  beforeAll(async () => {
    if (!admin) return;

    await admin`delete from onboarding_requests where idempotency_key in (${onboardingRequestA}, ${onboardingRequestC})`;
    await admin`
      delete from organizations
      where identity_provider_organization_id = ${identityProviderOrganizationC}
    `;
    await admin`delete from users where external_identity_id = ${actorC}`;

    await admin`
      insert into organizations (id, identity_provider_organization_id, name, slug)
      values
        (
          ${organizationA},
          ${identityProviderOrganizationA},
          'Tenant A',
          'integration-tenant-a'
        ),
        (
          ${organizationB},
          ${identityProviderOrganizationB},
          'Tenant B',
          'integration-tenant-b'
        )
      on conflict (id) do nothing
    `;

    await admin`
      insert into workspaces (
        id,
        organization_id,
        name,
        slug,
        target_country,
        default_language,
        locale,
        currency,
        timezone,
        niche
      )
      values
        (
          ${workspaceA},
          ${organizationA},
          'Workspace A',
          'workspace-a',
          'US',
          'en',
          'en-US',
          'USD',
          'UTC',
          'integration testing'
        ),
        (
          ${workspaceB},
          ${organizationB},
          'Workspace B',
          'workspace-b',
          'US',
          'en',
          'en-US',
          'USD',
          'UTC',
          'integration testing'
        )
      on conflict (id) do nothing
    `;

    await admin`
      insert into users (
        id,
        external_identity_id,
        email,
        display_name,
        email_verified
      )
      values
        (${userA}, ${actorA}, 'actor-a@example.test', 'Actor A', true),
        (${userB}, ${actorB}, 'actor-b@example.test', 'Actor B', true)
      on conflict (id) do nothing
    `;

    await admin`
      insert into memberships (organization_id, user_id, role)
      values
        (${organizationA}, ${userA}, 'owner'),
        (${organizationB}, ${userB}, 'owner')
      on conflict (organization_id, user_id) do nothing
    `;

    await admin`
      insert into workspace_memberships (
        organization_id,
        workspace_id,
        user_id,
        role
      )
      values
        (${organizationA}, ${workspaceA}, ${userA}, 'workspace_admin'),
        (${organizationB}, ${workspaceB}, ${userB}, 'workspace_admin')
      on conflict (workspace_id, user_id) do nothing
    `;

    await admin`
      insert into products (
        id,
        organization_id,
        workspace_id,
        source_product_id,
        canonical_key,
        name,
        merchant_name,
        currency,
        observed_at,
        source_payload
      )
      values
        (
          '018f6d4d-74d4-7c18-a1d4-bb620a63c201',
          ${organizationA},
          ${workspaceA},
          'tenant-a-product',
          'tenant-a-product',
          'Tenant A Product',
          'Tenant A Merchant',
          'USD',
          now(),
          '{}'::jsonb
        ),
        (
          '018f6d4d-74d4-7c18-a1d4-bb620a63c202',
          ${organizationB},
          ${workspaceB},
          'tenant-b-product',
          'tenant-b-product',
          'Tenant B Product',
          'Tenant B Merchant',
          'USD',
          now(),
          '{}'::jsonb
        )
      on conflict (id) do nothing
    `;

    await admin`
      insert into affiliate_connections (
        id,
        organization_id,
        workspace_id,
        provider,
        secret_reference,
        status,
        policy_version
      )
      values
        (${connectionA}, ${organizationA}, ${workspaceA}, 'awin', 'test/tenant-a', 'active', 'v1'),
        (${connectionB}, ${organizationB}, ${workspaceB}, 'awin', 'test/tenant-b', 'active', 'v1')
      on conflict (id) do nothing
    `;

    await admin`
      insert into feed_sync_states (
        organization_id,
        workspace_id,
        connection_id,
        publisher_id,
        advertiser_id,
        locale,
        status
      )
      values
        (${organizationA}, ${workspaceA}, ${connectionA}, 1001, 2001, 'en_US', 'succeeded'),
        (${organizationB}, ${workspaceB}, ${connectionB}, 1002, 2002, 'en_US', 'succeeded')
      on conflict (workspace_id, connection_id, publisher_id, advertiser_id, locale) do nothing
    `;

    await admin`
      insert into content_generation_requests (
        id,
        organization_id,
        workspace_id,
        requested_by_user_id,
        idempotency_key,
        request_fingerprint,
        status
      )
      values
        (${generationRequestA}, ${organizationA}, ${workspaceA}, ${userA}, 'tenant-a-generation', 'fingerprint-a', 'pending'),
        (${generationRequestB}, ${organizationB}, ${workspaceB}, ${userB}, 'tenant-b-generation', 'fingerprint-b', 'pending')
      on conflict (id) do nothing
    `;

    await admin`
      insert into content_items (id, organization_id, workspace_id, title, content_type, status)
      values
        (${contentItemA}, ${organizationA}, ${workspaceA}, 'Tenant A Review', 'article', 'in_review'),
        (${contentItemB}, ${organizationB}, ${workspaceB}, 'Tenant B Review', 'article', 'in_review')
      on conflict (id) do nothing
    `;
    await admin`
      insert into content_revisions (
        id, organization_id, workspace_id, content_item_id, revision_number, body,
        disclosure_version, source_snapshot, validator_results, checksum
      )
      values
        (${contentRevisionA}, ${organizationA}, ${workspaceA}, ${contentItemA}, 1, '{}'::jsonb, 'v1', '{}'::jsonb, '{"checks":[]}'::jsonb, 'a'),
        (${contentRevisionB}, ${organizationB}, ${workspaceB}, ${contentItemB}, 1, '{}'::jsonb, 'v1', '{}'::jsonb, '{"checks":[]}'::jsonb, 'b')
      on conflict (id) do nothing
    `;
    await admin`update content_items set current_revision_id = ${contentRevisionA} where id = ${contentItemA}`;
    await admin`update content_items set current_revision_id = ${contentRevisionB} where id = ${contentItemB}`;
    await admin`
      insert into content_review_actions (
        id, organization_id, workspace_id, content_item_id, content_revision_id,
        actor_user_id, action, validator_snapshot, request_fingerprint, idempotency_key
      )
      values
        (${reviewActionA}, ${organizationA}, ${workspaceA}, ${contentItemA}, ${contentRevisionA}, ${userA}, 'approved', '{}'::jsonb, 'review-a', 'review-a'),
        (${reviewActionB}, ${organizationB}, ${workspaceB}, ${contentItemB}, ${contentRevisionB}, ${userB}, 'approved', '{}'::jsonb, 'review-b', 'review-b')
      on conflict (id) do nothing
    `;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from onboarding_requests where idempotency_key = ${onboardingRequestA}`;
      await admin`delete from onboarding_requests where idempotency_key = ${onboardingRequestC}`;
      await admin`
        delete from organizations
        where identity_provider_organization_id = ${identityProviderOrganizationC}
      `;
      await admin`delete from organizations where id in (${organizationA}, ${organizationB})`;
      await admin`delete from users where external_identity_id = ${actorC}`;
      await admin`delete from users where id in (${userA}, ${userB})`;
      await admin.end({ timeout: 5 });
    }
    await closeDatabase();
    await application?.end({ timeout: 5 });
  });

  it("returns only rows inside the active organization and workspace", async () => {
    if (!application) return;

    const names = await application.begin(async (transaction) => {
      await transaction`select set_config('app.current_organization_id', ${organizationA}, true)`;
      await transaction`select set_config('app.current_workspace_id', ${workspaceA}, true)`;
      return transaction<{ name: string }[]>`select name from products order by name`;
    });

    expect(names).toEqual([{ name: "Tenant A Product" }]);
  });

  it("rejects writes whose tenant keys do not match the active context", async () => {
    if (!application) return;

    await expect(
      application.begin(async (transaction) => {
        await transaction`select set_config('app.current_organization_id', ${organizationA}, true)`;
        await transaction`select set_config('app.current_workspace_id', ${workspaceA}, true)`;
        await transaction`
          insert into products (
            organization_id,
            workspace_id,
            source_product_id,
            canonical_key,
            name,
            merchant_name,
            currency,
            observed_at,
            source_payload
          )
          values (
            ${organizationB},
            ${workspaceB},
            'cross-tenant-product',
            'cross-tenant-product',
            'Cross Tenant Product',
            'Untrusted Merchant',
            'USD',
            now(),
            '{}'::jsonb
          )
        `;
      }),
    ).rejects.toThrow(/row-level security policy/i);
  });

  it("isolates persisted feed freshness and lease state", async () => {
    if (!application) return;

    const rows = await application.begin(async (transaction) => {
      await transaction`select set_config('app.current_organization_id', ${organizationA}, true)`;
      await transaction`select set_config('app.current_workspace_id', ${workspaceA}, true)`;
      return transaction<
        { connection_id: string; advertiser_id: number }[]
      >`select connection_id, advertiser_id from feed_sync_states`;
    });

    expect(rows).toEqual([{ connection_id: connectionA, advertiser_id: 2001 }]);
  });

  it("isolates content generation idempotency and lease state", async () => {
    if (!application) return;

    const rows = await application.begin(async (transaction) => {
      await transaction`select set_config('app.current_organization_id', ${organizationA}, true)`;
      await transaction`select set_config('app.current_workspace_id', ${workspaceA}, true)`;
      return transaction<
        { id: string; idempotency_key: string }[]
      >`select id, idempotency_key from content_generation_requests`;
    });

    expect(rows).toEqual([{ id: generationRequestA, idempotency_key: "tenant-a-generation" }]);
  });

  it("isolates review history and keeps it append-only for the application role", async () => {
    if (!application || !admin) return;

    const rows = await application.begin(async (transaction) => {
      await transaction`select set_config('app.current_organization_id', ${organizationA}, true)`;
      await transaction`select set_config('app.current_workspace_id', ${workspaceA}, true)`;
      await transaction`update content_review_actions set comment = 'tampered' where id = ${reviewActionA}`;
      return transaction<
        { id: string; idempotency_key: string; comment: string | null }[]
      >`select id, idempotency_key, comment from content_review_actions`;
    });

    expect(rows).toEqual([{ id: reviewActionA, idempotency_key: "review-a", comment: null }]);
    const [stored] = await admin<
      { comment: string | null }[]
    >`select comment from content_review_actions where id = ${reviewActionA}`;
    expect(stored?.comment).toBeNull();
  });

  it("resolves tenant roles only for the authenticated actor and IdP organization", async () => {
    if (!application) return;

    const tenant = await application.begin(async (transaction) => {
      await transaction`select set_config('app.current_actor_external_id', ${actorA}, true)`;
      return transaction<
        {
          organization_id: string;
          workspace_id: string;
          user_id: string;
          organization_role: string;
          workspace_role: string | null;
        }[]
      >`
        select *
        from app_private.resolve_tenant(
          ${actorA},
          ${identityProviderOrganizationA},
          ${workspaceA}::uuid
        )
      `;
    });

    expect(tenant).toEqual([
      {
        organization_id: organizationA,
        workspace_id: workspaceA,
        user_id: userA,
        organization_role: "owner",
        workspace_role: "workspace_admin",
      },
    ]);

    const spoofed = await application.begin(async (transaction) => {
      await transaction`select set_config('app.current_actor_external_id', ${actorB}, true)`;
      return transaction`
        select *
        from app_private.resolve_tenant(
          ${actorA},
          ${identityProviderOrganizationA},
          ${workspaceA}::uuid
        )
      `;
    });
    expect(spoofed).toEqual([]);
  });

  it("isolates pre-tenant onboarding requests by authenticated actor", async () => {
    if (!application) return;

    await application.begin(async (transaction) => {
      await transaction`select set_config('app.current_actor_external_id', ${actorA}, true)`;
      await transaction`
        insert into onboarding_requests (
          idempotency_key,
          external_identity_id,
          request_fingerprint,
          organization_id,
          workspace_id
        )
        values (
          ${onboardingRequestA},
          ${actorA},
          'integration-fingerprint',
          gen_random_uuid(),
          gen_random_uuid()
        )
      `;
    });

    const visibleToActorA = await application.begin(async (transaction) => {
      await transaction`select set_config('app.current_actor_external_id', ${actorA}, true)`;
      return transaction<{ count: string }[]>`
        select count(*)::text AS count
        from onboarding_requests
        where idempotency_key = ${onboardingRequestA}
      `;
    });
    const visibleToActorB = await application.begin(async (transaction) => {
      await transaction`select set_config('app.current_actor_external_id', ${actorB}, true)`;
      return transaction<{ count: string }[]>`
        select count(*)::text AS count
        from onboarding_requests
        where idempotency_key = ${onboardingRequestA}
      `;
    });

    expect(visibleToActorA).toEqual([{ count: "1" }]);
    expect(visibleToActorB).toEqual([{ count: "0" }]);
  });

  it("leases, fails, retries, completes, and replays a tenant-scoped WordPress draft", async () => {
    if (!admin || !application) return;
    await admin`
      insert into publishing_destinations (
        id, organization_id, workspace_id, name, type, base_url,
        secret_reference, status, verified_at
      )
      values (
        ${destinationA}, ${organizationA}, ${workspaceA}, 'Tenant A WordPress', 'wordpress',
        'https://publisher.example.com', 'test/tenant-a-wordpress', 'active', now()
      )
      on conflict (id) do nothing
    `;
    await admin`update content_items set status = 'approved' where id = ${contentItemA}`;
    const context = {
      organizationId: organizationA,
      workspaceId: workspaceA,
      userId: userA,
      organizationRole: "owner" as const,
      workspaceRole: "workspace_admin" as const,
    };
    const request = {
      contentId: contentItemA,
      revisionId: contentRevisionA,
      destinationId: destinationA,
    };

    const first = await reserveWordPressPublication(context, request, publicationRequestA);
    expect(first.replayed).toBe(false);
    if (first.replayed) return;
    await failWordPressPublication(context, first, "simulated_timeout");

    const retry = await reserveWordPressPublication(context, request, publicationRequestA);
    expect(retry.replayed).toBe(false);
    if (retry.replayed) return;
    expect(retry.leaseToken).not.toBe(first.leaseToken);
    const completed = await completeWordPressPublication(context, retry, {
      id: "92",
      slug: retry.remoteSlug,
      url: "https://publisher.example.com/?p=92",
    });
    expect(completed).toMatchObject({ status: "draft_created", replayed: false });

    const replay = await reserveWordPressPublication(context, request, publicationRequestA);
    expect(replay).toMatchObject({
      replayed: true,
      publication: { status: "draft_created", remotePostId: "92", replayed: true },
    });

    const tenantBVisibility = await application.begin(async (transaction) => {
      await transaction`select set_config('app.current_organization_id', ${organizationB}, true)`;
      await transaction`select set_config('app.current_workspace_id', ${workspaceB}, true)`;
      return transaction<{ count: string }[]>`
        select count(*)::text AS count
        from publishing_destinations
        where id = ${destinationA}
      `;
    });
    expect(tenantBVisibility).toEqual([{ count: "0" }]);
  });

  it("serializes concurrent onboarding completion and replays through forced RLS", async () => {
    const actor = {
      externalIdentityId: actorC,
      sessionId: "session_integration_onboarding",
    };
    const request = {
      organizationName: "Onboarding Integration",
      workspace: {
        name: "US Test Workspace",
        targetCountry: "US",
        defaultLanguage: "en",
        locale: "en-US",
        currency: "USD",
        timezone: "UTC",
        niche: "Integration testing",
      },
    };
    const reservation = await reserveOnboarding(
      actor,
      onboardingRequestC,
      "onboarding-integration-fingerprint",
    );
    await recordOnboardingIdentity(actor, onboardingRequestC, {
      identityProviderOrganizationId: identityProviderOrganizationC,
      identityProviderMembershipId: identityProviderMembershipC,
    });

    const completionInput = {
      actor,
      reservation: {
        ...reservation,
        identityProviderOrganizationId: identityProviderOrganizationC,
        identityProviderMembershipId: identityProviderMembershipC,
      },
      request,
      identityProfile: {
        email: "onboarding@example.test",
        displayName: "Onboarding Integration",
        emailVerified: true,
      },
      identityProviderOrganizationId: identityProviderOrganizationC,
      identityProviderMembershipId: identityProviderMembershipC,
      requestId: "request-integration-onboarding",
      sourceIpHash: "integration-source-ip-hash",
    };
    const concurrentResults = await Promise.all([
      completeOnboarding(completionInput),
      completeOnboarding(completionInput),
    ]);
    expect(concurrentResults.map((result) => result.replayed).sort()).toEqual([false, true]);
    const completed = concurrentResults.find((result) => !result.replayed);
    expect(completed).toBeDefined();

    expect(completed).toMatchObject({
      replayed: false,
      organization: {
        identityProviderOrganizationId: identityProviderOrganizationC,
        role: "owner",
      },
      workspace: {
        name: "US Test Workspace",
        role: "workspace_admin",
        status: "setup",
      },
      onboarding: {
        status: "in_progress",
        currentStep: "publishing_destination",
      },
    });

    const replayReservation = await reserveOnboarding(
      actor,
      onboardingRequestC,
      "onboarding-integration-fingerprint",
    );
    const replayed = await replayCompletedOnboarding(actor, replayReservation);
    expect(replayed.replayed).toBe(true);
    expect(replayed.workspace.id).toBe(completed?.workspace.id);
  });
});
