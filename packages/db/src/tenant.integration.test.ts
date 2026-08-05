import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  completeOnboarding,
  recordOnboardingIdentity,
  replayCompletedOnboarding,
  reserveOnboarding,
} from "./onboarding.js";
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
