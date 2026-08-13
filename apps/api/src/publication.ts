import {
  wordpressConnectionTestResponseSchema,
  wordpressDestinationSchema,
  wordpressDraftPublicationSchema,
  type ConfigureWordPressDestination,
  type CreateWordPressDraft,
  type TenantContext,
  type TestWordPressConnection,
  type WordPressConnectionTestResponse,
  type WordPressDestination,
  type WordPressDraftPublication,
} from "@profit-pilot/contracts";
import {
  completeWordPressPublication,
  failWordPressPublication,
  reserveWordPressPublication,
  saveVerifiedWordPressDestination,
  type ReserveWordPressPublicationResult,
  type WordPressPublicationReservation,
} from "@profit-pilot/db";
import escapeHtml from "escape-html";

import type { ApiConfig } from "./config.js";
import type { WordPressCredentialResolver } from "./secrets.js";
import {
  canonicalWordPressSiteUrl,
  type WordPressClient,
  type WordPressUser,
} from "./wordpress.js";

export class WordPressPublicationConfigurationError extends Error {
  readonly code = "wordpress_publication_not_configured";
  constructor() {
    super("WordPress publication requires a configured PostgreSQL database");
    this.name = "WordPressPublicationConfigurationError";
  }
}

interface PublicationRepository {
  saveDestination(
    context: TenantContext,
    input: ConfigureWordPressDestination & { siteUrl: string },
    verifiedAt: Date,
  ): Promise<WordPressDestination>;
  reserve(
    context: TenantContext,
    input: { contentId: string; revisionId: string; destinationId: string },
    idempotencyKey: string,
  ): Promise<ReserveWordPressPublicationResult>;
  complete(
    context: TenantContext,
    reservation: WordPressPublicationReservation,
    remote: { id: string; slug: string; url: string },
  ): Promise<WordPressDraftPublication>;
  fail(
    context: TenantContext,
    reservation: WordPressPublicationReservation,
    errorCode: string,
  ): Promise<void>;
}

const databaseRepository: PublicationRepository = {
  saveDestination: saveVerifiedWordPressDestination,
  reserve: reserveWordPressPublication,
  complete: completeWordPressPublication,
  fail: failWordPressPublication,
};

export interface PublicationService {
  testConnection(input: TestWordPressConnection): Promise<WordPressConnectionTestResponse>;
  configureDestination(
    context: TenantContext,
    input: ConfigureWordPressDestination,
  ): Promise<WordPressDestination>;
  createDraft(
    context: TenantContext,
    contentId: string,
    input: CreateWordPressDraft,
    idempotencyKey: string,
  ): Promise<WordPressDraftPublication>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function paragraph(value: unknown): string {
  const text = typeof value === "string" ? value : record(value).text;
  const escaped = escapeHtml(String(text ?? "")).trim();
  return escaped ? `<!-- wp:paragraph -->\n<p>${escaped}</p>\n<!-- /wp:paragraph -->` : "";
}

export function renderGutenbergArticle(body: unknown): string {
  const source = record(body);
  const blocks: string[] = [];
  const disclosure = paragraph(source.disclosure);
  if (disclosure) blocks.push(disclosure);
  if (Array.isArray(source.introduction)) {
    blocks.push(...source.introduction.map(paragraph).filter(Boolean));
  }
  if (Array.isArray(source.sections)) {
    for (const item of source.sections) {
      const section = record(item);
      const heading = escapeHtml(String(section.heading ?? "")).trim();
      if (heading) {
        blocks.push(`<!-- wp:heading -->\n<h2>${heading}</h2>\n<!-- /wp:heading -->`);
      }
      if (Array.isArray(section.claims)) {
        blocks.push(...section.claims.map(paragraph).filter(Boolean));
      }
    }
  }
  const cta = paragraph(source.cta);
  if (cta) blocks.push(cta);
  if (blocks.length === 0) {
    throw new WordPressPublicationConfigurationError();
  }
  return blocks.join("\n\n");
}

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error ? String(error.code) : "wordpress_unknown";
}

export function createPublicationService(input: {
  configured: boolean;
  client: WordPressClient;
  credentialResolver: WordPressCredentialResolver;
  repository?: PublicationRepository;
  now?: () => Date;
}): PublicationService {
  const repository = input.repository ?? databaseRepository;
  const now = input.now ?? (() => new Date());

  async function verifiedUser(
    siteUrl: string,
    credentials: { username: string; applicationPassword: string },
  ): Promise<{ siteUrl: string; user: WordPressUser }> {
    const canonicalUrl = canonicalWordPressSiteUrl(siteUrl);
    const user = await input.client.verify(canonicalUrl, credentials);
    return { siteUrl: canonicalUrl, user };
  }

  return {
    async testConnection(connection) {
      const verifiedAt = now();
      const verified = await verifiedUser(connection.siteUrl, connection);
      return wordpressConnectionTestResponseSchema.parse({
        provider: "wordpress",
        status: "verified",
        siteUrl: verified.siteUrl,
        user: verified.user,
        verifiedAt: verifiedAt.toISOString(),
      });
    },

    async configureDestination(context, destination) {
      if (!input.configured) throw new WordPressPublicationConfigurationError();
      const credentials = await input.credentialResolver.resolveCredentials(
        destination.secretReference,
      );
      const verifiedAt = now();
      const verified = await verifiedUser(destination.siteUrl, credentials);
      return wordpressDestinationSchema.parse(
        await repository.saveDestination(
          context,
          { ...destination, siteUrl: verified.siteUrl },
          verifiedAt,
        ),
      );
    },

    async createDraft(context, contentId, request, idempotencyKey) {
      if (!input.configured) throw new WordPressPublicationConfigurationError();
      const reserved = await repository.reserve(
        context,
        { contentId, revisionId: request.revisionId, destinationId: request.destinationId },
        idempotencyKey,
      );
      if (reserved.replayed) return wordpressDraftPublicationSchema.parse(reserved.publication);
      try {
        const credentials = await input.credentialResolver.resolveCredentials(
          reserved.secretReference,
        );
        const remote = await input.client.ensureDraft({
          siteUrl: reserved.siteUrl,
          credentials,
          title: reserved.title,
          content: renderGutenbergArticle(reserved.body),
          slug: reserved.remoteSlug,
        });
        return wordpressDraftPublicationSchema.parse(
          await repository.complete(context, reserved, remote),
        );
      } catch (error) {
        try {
          await repository.fail(context, reserved, errorCode(error));
        } catch (recordingError) {
          throw new AggregateError(
            [error, recordingError],
            "WordPress publication failed and its failure state could not be recorded",
          );
        }
        throw error;
      }
    },
  };
}

export function createConfiguredPublicationService(
  config: ApiConfig,
  client: WordPressClient,
  credentialResolver: WordPressCredentialResolver,
): PublicationService {
  return createPublicationService({
    configured: Boolean(config.DATABASE_URL),
    client,
    credentialResolver,
  });
}
