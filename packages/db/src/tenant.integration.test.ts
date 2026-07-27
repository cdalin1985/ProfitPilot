import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env.DATABASE_ADMIN_URL;
const applicationUrl = process.env.DATABASE_INTEGRATION_URL;
const integrationAvailable = Boolean(adminUrl && applicationUrl);

const organizationA = "018f6d4d-74d4-7c18-a1d4-bb620a63c001";
const organizationB = "018f6d4d-74d4-7c18-a1d4-bb620a63c002";
const workspaceA = "018f6d4d-74d4-7c18-a1d4-bb620a63c101";
const workspaceB = "018f6d4d-74d4-7c18-a1d4-bb620a63c102";

const admin = adminUrl ? postgres(adminUrl, { max: 1 }) : undefined;
const application = applicationUrl ? postgres(applicationUrl, { max: 1 }) : undefined;

describe.skipIf(!integrationAvailable)("PostgreSQL tenant isolation", () => {
  beforeAll(async () => {
    if (!admin) return;

    await admin`
      insert into organizations (id, name, slug)
      values
        (${organizationA}, 'Tenant A', 'integration-tenant-a'),
        (${organizationB}, 'Tenant B', 'integration-tenant-b')
      on conflict (id) do nothing
    `;

    await admin`
      insert into workspaces (id, organization_id, name, slug, locale, currency, timezone)
      values
        (${workspaceA}, ${organizationA}, 'Workspace A', 'workspace-a', 'en-US', 'USD', 'UTC'),
        (${workspaceB}, ${organizationB}, 'Workspace B', 'workspace-b', 'en-US', 'USD', 'UTC')
      on conflict (id) do nothing
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
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from organizations where id in (${organizationA}, ${organizationB})`;
      await admin.end({ timeout: 5 });
    }
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
});
