import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentReviewWorkspace } from "@/components/content/content-review-workspace";
import { getContentReview } from "@/lib/data";

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
  const content = await getContentReview(contentId);

  if (!content) {
    notFound();
  }

  return <ContentReviewWorkspace content={content} />;
}
