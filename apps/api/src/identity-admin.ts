import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
  WorkOS,
} from "@workos-inc/node";

import type { IdentityProfile } from "@profit-pilot/db";

import type { ApiConfig } from "./config.js";

export interface IdentityAdmin {
  getUser(externalIdentityId: string): Promise<IdentityProfile>;
  ensureOrganization(input: { localOrganizationId: string; name: string }): Promise<string>;
  ensureOrganizationMembership(input: {
    identityProviderOrganizationId: string;
    externalIdentityId: string;
  }): Promise<string>;
}

export class IdentityProvisioningError extends Error {
  readonly code = "identity_provisioning_failed";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IdentityProvisioningError";
  }
}

export function createIdentityAdmin(config: ApiConfig): IdentityAdmin {
  if (config.AUTH_MODE === "development") {
    return {
      async getUser() {
        return {
          email: "owner@localhost.test",
          displayName: "Development Owner",
          emailVerified: true,
        };
      },
      async ensureOrganization({ localOrganizationId }) {
        return `org_dev_${localOrganizationId.replaceAll("-", "")}`;
      },
      async ensureOrganizationMembership({ identityProviderOrganizationId }) {
        return `om_dev_${identityProviderOrganizationId.slice(-24)}`;
      },
    };
  }

  if (!config.WORKOS_API_KEY) {
    throw new Error("WORKOS_API_KEY is required for identity administration");
  }

  const workos = new WorkOS(config.WORKOS_API_KEY);

  return {
    async getUser(externalIdentityId) {
      try {
        const user = await workos.userManagement.getUser(externalIdentityId);
        const composedName = [user.firstName, user.lastName]
          .filter((part): part is string => Boolean(part))
          .join(" ");
        return {
          email: user.email,
          displayName: user.name ?? (composedName || user.email.slice(0, user.email.indexOf("@"))),
          emailVerified: user.emailVerified,
          ...(user.profilePictureUrl ? { profilePictureUrl: user.profilePictureUrl } : {}),
        };
      } catch (error) {
        throw new IdentityProvisioningError("The authenticated WorkOS user could not be loaded", {
          cause: error,
        });
      }
    },

    async ensureOrganization({ localOrganizationId, name }) {
      try {
        const existing =
          await workos.organizations.getOrganizationByExternalId(localOrganizationId);
        return existing.id;
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw new IdentityProvisioningError("The WorkOS organization could not be reconciled", {
            cause: error,
          });
        }
      }

      try {
        const created = await workos.organizations.createOrganization({
          name,
          externalId: localOrganizationId,
          metadata: { provisioned_by: "profit_pilot_onboarding" },
        });
        return created.id;
      } catch (error) {
        if (error instanceof ConflictException) {
          try {
            const raced =
              await workos.organizations.getOrganizationByExternalId(localOrganizationId);
            return raced.id;
          } catch (reconciliationError) {
            throw new IdentityProvisioningError(
              "A concurrent WorkOS organization could not be reconciled",
              { cause: reconciliationError },
            );
          }
        }
        throw new IdentityProvisioningError("The WorkOS organization could not be created", {
          cause: error,
        });
      }
    },

    async ensureOrganizationMembership({ identityProviderOrganizationId, externalIdentityId }) {
      const listMemberships = () =>
        workos.userManagement.listOrganizationMemberships({
          organizationId: identityProviderOrganizationId,
          userId: externalIdentityId,
          statuses: ["active", "inactive", "pending"],
          limit: 10,
        });

      try {
        const memberships = await listMemberships();
        const existing = memberships.data[0];
        if (existing?.status === "active") {
          return existing.id;
        }
        if (existing?.status === "pending") {
          throw new IdentityProvisioningError(
            "A pending WorkOS invitation must be accepted or removed before onboarding",
          );
        }

        try {
          const membership = await workos.userManagement.createOrganizationMembership({
            organizationId: identityProviderOrganizationId,
            userId: externalIdentityId,
            roleSlug: config.WORKOS_OWNER_ROLE_SLUG,
          });
          return membership.id;
        } catch (error) {
          if (error instanceof ConflictException || error instanceof UnprocessableEntityException) {
            const reconciled = (await listMemberships()).data.find(
              (membership) => membership.status === "active",
            );
            if (reconciled) {
              return reconciled.id;
            }
          }
          throw error;
        }
      } catch (error) {
        if (error instanceof IdentityProvisioningError) {
          throw error;
        }
        throw new IdentityProvisioningError(
          "The WorkOS organization membership could not be provisioned",
          { cause: error },
        );
      }
    },
  };
}
