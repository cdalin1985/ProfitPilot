import {
  affiliateLinkSchema,
  type AffiliateLink,
  type CreateAffiliateLink,
  type TenantContext,
} from "@profit-pilot/contracts";
import { signClickToken } from "@profit-pilot/clicks";
import { createAffiliateLink, revokeAffiliateLink } from "@profit-pilot/db";

import type { ApiConfig } from "./config.js";

export interface ClickAttributionService {
  createLink(
    context: TenantContext,
    contentId: string,
    request: CreateAffiliateLink,
    idempotencyKey: string,
  ): Promise<AffiliateLink>;
  revokeLink(context: TenantContext, linkId: string): Promise<void>;
}

export function createClickAttributionService(config: ApiConfig): ClickAttributionService {
  const signingKey =
    config.CLICK_SIGNING_KEY ??
    Buffer.from("profit-pilot-development-signing-key-v1").toString("base64url");
  return {
    async createLink(context, contentId, request, idempotencyKey) {
      const row = await createAffiliateLink(
        context,
        {
          contentId,
          revisionId: request.revisionId,
          expiresInDays: request.expiresInDays,
          signingKeyId: config.CLICK_SIGNING_KEY_ID,
        },
        idempotencyKey,
      );
      const token = signClickToken(
        {
          keyId: row.signingKeyId,
          linkId: row.id,
          organizationId: row.organizationId,
          workspaceId: row.workspaceId,
          expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
        },
        signingKey,
      );
      return affiliateLinkSchema.parse({
        linkId: row.id,
        contentId: row.contentId,
        revisionId: row.revisionId,
        productId: row.productId,
        redirectUrl: new URL(`/r/${token}`, config.PUBLIC_REDIRECT_BASE_URL).toString(),
        expiresAt: row.expiresAt.toISOString(),
        revokedAt: row.revokedAt?.toISOString() ?? null,
        replayed: row.replayed,
      });
    },
    revokeLink: (context, linkId) => revokeAffiliateLink(context, linkId),
  };
}
