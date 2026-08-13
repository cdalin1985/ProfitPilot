import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { can } from "@profit-pilot/authz";

import { ContentReviewWorkspace } from "@/components/content/content-review-workspace";
import { getActiveWorkspaceSession } from "@/lib/active-session";
import { requireWebAuth } from "@/lib/auth";
import { getContentReview } from "@/lib/profit-pilot-api";

export const metadata: Metadata = {
  title: "Content review",
};

export const dynamic = "force-dynamic";

interface ContentReviewPageProps {
  params: Promise<{ contentId: string }>;
}

export default async function ContentReviewPage({
  params,
}: ContentReviewPageProps): Promise<React.ReactNode> {
  const { contentId } = await params;
  const auth = await requireWebAuth();
  const session = await getActiveWorkspaceSession(auth);
  if (session.status !== "active") notFound();
  const content = await getContentReview(auth, session.tenant.workspaceId, contentId);

  if (!content) {
    notFound();
  }

  return (
    <ContentReviewWorkspace canReview={can(session.tenant, "content:approve")} content={content} />
  );
}
