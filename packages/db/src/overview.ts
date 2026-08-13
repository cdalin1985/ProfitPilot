import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";

import {
  overviewSchema,
  type Overview,
  type QueueItem,
  type TenantContext,
} from "@profit-pilot/contracts";

import { withTenant } from "./database.js";
import {
  affiliateConnections,
  clickEvents,
  contentItems,
  contentRevisions,
  publications,
  publishingDestinations,
  workspaces,
} from "./schema.js";

const REPORTING_WINDOW_MS = 30 * 86_400_000;

interface OpportunityRow {
  id: string;
  product_name: string;
  provider: "awin" | "cj_affiliate" | "amazon_associates" | "manual_feed" | null;
  score: number;
  previous_score: number | null;
  commission_rate: string | null;
  price: string | null;
  currency: string;
  observed_at: Date;
  product_created_at: Date;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function subjectFromSourceSnapshot(value: unknown): string {
  const facts = record(value).facts;
  if (!Array.isArray(facts)) return "Editorial content";
  for (const candidate of facts) {
    const fact = record(candidate);
    if (fact.id === "product.name" && typeof fact.value === "string" && fact.value.trim()) {
      return fact.value.trim().slice(0, 240);
    }
  }
  return "Editorial content";
}

export function publishingHealth(
  outcomes: ReadonlyArray<{ status: string; total: number }>,
): number | null {
  let successes = 0;
  let failures = 0;
  for (const outcome of outcomes) {
    if (["draft_created", "scheduled", "published"].includes(outcome.status)) {
      successes += outcome.total;
    } else if (["verification_failed", "failed"].includes(outcome.status)) {
      failures += outcome.total;
    }
  }
  const terminal = successes + failures;
  return terminal === 0 ? null : Math.round((successes / terminal) * 1_000) / 10;
}

export function opportunityTrend(
  currentScore: number,
  previousScore: number | null,
  productCreatedAt: Date,
  now: Date,
): "rising" | "new" | "steady" | "falling" {
  if (previousScore === null || now.getTime() - productCreatedAt.getTime() < 72 * 3_600_000) {
    return "new";
  }
  const delta = currentScore - previousScore;
  if (delta >= 5) return "rising";
  if (delta <= -5) return "falling";
  return "steady";
}

function queuePriority(status: QueueItem["status"]): number {
  if (status === "needs_reconnect") return 0;
  if (status === "needs_review") return 1;
  return 2;
}

export async function getWorkspaceOverview(
  context: TenantContext,
  now = new Date(),
): Promise<Overview> {
  return withTenant(context.organizationId, context.workspaceId, async (transaction) => {
    const windowStartedAt = new Date(now.getTime() - REPORTING_WINDOW_MS);

    const [workspace] = await transaction
      .select({ currency: workspaces.currency })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.id, context.workspaceId),
          eq(workspaces.organizationId, context.organizationId),
        ),
      )
      .limit(1);
    if (!workspace) throw new Error("The overview workspace was not found");

    const [qualifiedClickRow] = await transaction
      .select({ total: count() })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.organizationId, context.organizationId),
          eq(clickEvents.workspaceId, context.workspaceId),
          eq(clickEvents.classification, "qualified"),
          gte(clickEvents.occurredAt, windowStartedAt),
        ),
      );

    const contentCounts = await transaction
      .select({ status: contentItems.status, total: count() })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.organizationId, context.organizationId),
          eq(contentItems.workspaceId, context.workspaceId),
        ),
      )
      .groupBy(contentItems.status);
    const contentCount = new Map(contentCounts.map((row) => [row.status, Number(row.total)]));

    const publicationOutcomes = await transaction
      .select({ status: publications.status, total: count() })
      .from(publications)
      .where(
        and(
          eq(publications.organizationId, context.organizationId),
          eq(publications.workspaceId, context.workspaceId),
          gte(publications.createdAt, windowStartedAt),
          inArray(publications.status, [
            "draft_created",
            "scheduled",
            "published",
            "verification_failed",
            "failed",
          ]),
        ),
      )
      .groupBy(publications.status);

    const opportunityRows = await transaction.execute(sql<OpportunityRow>`
      with scored as (
        select
          o.id,
          o.product_id,
          o.score,
          lag(o.score) over (partition by o.product_id order by o.scored_at, o.id) as previous_score,
          row_number() over (partition by o.product_id order by o.scored_at desc, o.id desc) as current_rank
        from opportunities o
        where o.organization_id = ${context.organizationId}::uuid
          and o.workspace_id = ${context.workspaceId}::uuid
      )
      select
        scored.id,
        p.name as product_name,
        ac.provider,
        scored.score,
        scored.previous_score,
        p.commission_rate,
        p.price,
        p.currency,
        p.observed_at,
        p.created_at as product_created_at
      from scored
      inner join products p on p.id = scored.product_id
      left join affiliate_connections ac on ac.id = p.connection_id
      where scored.current_rank = 1
        and p.organization_id = ${context.organizationId}::uuid
        and p.workspace_id = ${context.workspaceId}::uuid
        and p.available = true
        and (p.expires_at is null or p.expires_at > ${now})
      order by scored.score desc, p.observed_at desc, scored.id
      limit 20
    `);

    const contentQueueRows = await transaction
      .select({
        id: contentItems.id,
        title: contentItems.title,
        status: contentItems.status,
        occurredAt: contentItems.updatedAt,
        revisionId: contentItems.currentRevisionId,
        sourceSnapshot: contentRevisions.sourceSnapshot,
      })
      .from(contentItems)
      .leftJoin(contentRevisions, eq(contentRevisions.id, contentItems.currentRevisionId))
      .where(
        and(
          eq(contentItems.organizationId, context.organizationId),
          eq(contentItems.workspaceId, context.workspaceId),
          inArray(contentItems.status, ["in_review", "approved"]),
        ),
      )
      .orderBy(desc(contentItems.updatedAt))
      .limit(20);

    const approvedRevisionIds = contentQueueRows.flatMap((row) =>
      row.status === "approved" && row.revisionId ? [row.revisionId] : [],
    );
    const alreadyPublished =
      approvedRevisionIds.length === 0
        ? []
        : await transaction
            .select({ revisionId: publications.contentRevisionId })
            .from(publications)
            .where(
              and(
                eq(publications.organizationId, context.organizationId),
                eq(publications.workspaceId, context.workspaceId),
                inArray(publications.contentRevisionId, approvedRevisionIds),
                inArray(publications.status, [
                  "creating_draft",
                  "draft_created",
                  "scheduled",
                  "published",
                ]),
              ),
            );
    const publishedRevisionIds = new Set(alreadyPublished.map((row) => row.revisionId));

    const affiliateReconnects = await transaction
      .select({
        id: affiliateConnections.id,
        provider: affiliateConnections.provider,
        occurredAt: affiliateConnections.updatedAt,
      })
      .from(affiliateConnections)
      .where(
        and(
          eq(affiliateConnections.organizationId, context.organizationId),
          eq(affiliateConnections.workspaceId, context.workspaceId),
          inArray(affiliateConnections.status, ["degraded", "action_required", "revoked"]),
        ),
      )
      .orderBy(desc(affiliateConnections.updatedAt))
      .limit(5);
    const destinationReconnects = await transaction
      .select({
        id: publishingDestinations.id,
        name: publishingDestinations.name,
        occurredAt: publishingDestinations.updatedAt,
      })
      .from(publishingDestinations)
      .where(
        and(
          eq(publishingDestinations.organizationId, context.organizationId),
          eq(publishingDestinations.workspaceId, context.workspaceId),
          inArray(publishingDestinations.status, ["degraded", "action_required", "revoked"]),
        ),
      )
      .orderBy(desc(publishingDestinations.updatedAt))
      .limit(5);

    const queue: QueueItem[] = [
      ...contentQueueRows.flatMap((row): QueueItem[] => {
        if (
          row.status === "approved" &&
          (!row.revisionId || publishedRevisionIds.has(row.revisionId))
        ) {
          return [];
        }
        return [
          {
            id: row.id,
            title: row.title,
            subject: subjectFromSourceSnapshot(row.sourceSnapshot),
            status: row.status === "in_review" ? "needs_review" : "ready_to_publish",
            occurredAt: row.occurredAt.toISOString(),
            href: `/content/${row.id}`,
          },
        ];
      }),
      ...affiliateReconnects.map((row): QueueItem => ({
        id: row.id,
        title: `Reconnect ${row.provider.replaceAll("_", " ")}`,
        subject: "Affiliate connection",
        status: "needs_reconnect",
        occurredAt: row.occurredAt.toISOString(),
        href: "/integrations",
      })),
      ...destinationReconnects.map((row): QueueItem => ({
        id: row.id,
        title: `Reconnect ${row.name}`,
        subject: "Publishing destination",
        status: "needs_reconnect",
        occurredAt: row.occurredAt.toISOString(),
        href: "/integrations",
      })),
    ]
      .sort(
        (left, right) =>
          queuePriority(left.status) - queuePriority(right.status) ||
          Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
      )
      .slice(0, 5);

    const health = publishingHealth(
      publicationOutcomes.map((row) => ({ status: row.status, total: Number(row.total) })),
    );

    const latestOpportunities = Array.from(opportunityRows) as unknown as OpportunityRow[];

    return overviewSchema.parse({
      metrics: {
        qualifiedClicks: Number(qualifiedClickRow?.total ?? 0),
        commissionAmount: 0,
        commissionCurrency: workspace.currency,
        commissionAvailable: false,
        contentAwaitingReview: contentCount.get("in_review") ?? 0,
        publishingHealthPercent: health,
      },
      opportunities: latestOpportunities.map((row) => {
        const commissionRate = Number(row.commission_rate ?? 0);
        const price = Number(row.price ?? 0);
        return {
          id: row.id,
          productName: row.product_name,
          network: row.provider ?? "manual_feed",
          level: row.score >= 80 ? "high" : row.score >= 60 ? "medium" : "low",
          score: row.score,
          commissionRate,
          averageCommission: (price * commissionRate) / 100,
          commissionCurrency: row.currency,
          observedAt: row.observed_at.toISOString(),
          freshnessTrend: opportunityTrend(
            row.score,
            row.previous_score,
            row.product_created_at,
            now,
          ),
        };
      }),
      queue,
      pipeline: {
        draft:
          (contentCount.get("draft") ?? 0) +
          (contentCount.get("generating") ?? 0) +
          (contentCount.get("validating") ?? 0) +
          (contentCount.get("changes_requested") ?? 0),
        inReview: contentCount.get("in_review") ?? 0,
        approved: contentCount.get("approved") ?? 0,
        scheduled: contentCount.get("scheduled") ?? 0,
        published: contentCount.get("published") ?? 0,
      },
      generatedAt: now.toISOString(),
    });
  });
}
