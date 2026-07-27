import "server-only";

import {
  contentReviewSchema,
  overviewSchema,
  type ContentReview,
  type Overview,
} from "@profit-pilot/contracts";
import { developmentContentReview, developmentOverview } from "@profit-pilot/fixtures";

export async function getOverview(): Promise<Overview> {
  if (process.env.NODE_ENV !== "production") {
    return overviewSchema.parse(developmentOverview);
  }

  throw new Error("The production overview repository has not been configured");
}

export async function getContentReview(contentId: string): Promise<ContentReview | undefined> {
  if (process.env.NODE_ENV !== "production") {
    if (contentId !== developmentContentReview.id) {
      return undefined;
    }
    return contentReviewSchema.parse(developmentContentReview);
  }

  throw new Error("The production content repository has not been configured");
}
