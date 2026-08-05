import {
  contentReviewActionResponseSchema,
  contentReviewSchema,
  type ApproveContentRevision,
  type ContentReview,
  type ContentReviewActionResponse,
  type RequestContentChanges,
  type TenantContext,
} from "@profit-pilot/contracts";
import { approveContentRevision, getContentReview, requestContentChanges } from "@profit-pilot/db";
import { developmentContentReview } from "@profit-pilot/fixtures";

import type { ApiConfig } from "./config.js";

export interface ContentReviewService {
  get(context: TenantContext, contentId: string): Promise<ContentReview | undefined>;
  requestChanges(
    context: TenantContext,
    contentId: string,
    input: RequestContentChanges,
    idempotencyKey: string,
  ): Promise<ContentReviewActionResponse>;
  approve(
    context: TenantContext,
    contentId: string,
    input: ApproveContentRevision,
    idempotencyKey: string,
  ): Promise<ContentReviewActionResponse>;
}

export function createContentReviewService(config: ApiConfig): ContentReviewService {
  if (config.DATABASE_URL) {
    return {
      get: getContentReview,
      requestChanges: requestContentChanges,
      approve: approveContentRevision,
    };
  }

  function developmentAction(
    contentId: string,
    revisionId: string,
    action: "changes_requested" | "approved",
  ): ContentReviewActionResponse {
    return contentReviewActionResponseSchema.parse({
      contentId,
      revisionId,
      actionId: crypto.randomUUID(),
      action,
      status: action,
      actedAt: new Date().toISOString(),
      replayed: false,
    });
  }

  return {
    async get(_context, contentId) {
      return contentId === developmentContentReview.id
        ? contentReviewSchema.parse(developmentContentReview)
        : undefined;
    },
    async requestChanges(_context, contentId, input) {
      return developmentAction(contentId, input.revisionId, "changes_requested");
    },
    async approve(_context, contentId, input) {
      return developmentAction(contentId, input.revisionId, "approved");
    },
  };
}
