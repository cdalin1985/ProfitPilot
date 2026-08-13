import { createHash, createHmac, randomUUID } from "node:crypto";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";

import { classifyUserAgent, InvalidClickTokenError, verifyClickToken } from "@profit-pilot/clicks";
import { clickEventEnvelopeSchema } from "@profit-pilot/contracts";
import { AffiliateLinkNotFoundError, resolveAffiliateLink } from "@profit-pilot/db";

export interface RedirectConfig { signingKeys: Record<string, string>; privacyKey: string; privacyKeyId: string; eventAuthKey: string; ingestionUrl: string; }

function visitorHash(key: string, ip: string, userAgent: string): string {
  const prefix = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip.split(".").slice(0, 3).join(".");
  return createHmac("sha256", key).update(`${prefix}\0${userAgent.slice(0, 256)}`).digest("hex");
}

export async function buildRedirectServer(config: RedirectConfig): Promise<FastifyInstance> {
  const server = Fastify({ logger: false, bodyLimit: 16_384, trustProxy: true });
  await server.register(helmet, { contentSecurityPolicy: false });
  await server.register(rateLimit, { max: 600, timeWindow: "1 minute", keyGenerator: (request) => request.ip });
  server.route<{ Params: { token: string } }>({
    method: ["GET", "HEAD"], path: "/r/:token",
    handler: async (request, reply) => {
      try {
        const payload = verifyClickToken(request.params.token, config.signingKeys);
        const link = await resolveAffiliateLink(payload);
        const userAgent = request.headers["user-agent"];
        const purpose = request.headers.purpose;
        const secPurpose = request.headers["sec-purpose"];
        const traffic = classifyUserAgent({
          method: request.method as "GET" | "HEAD",
          ...(typeof userAgent === "string" ? { userAgent } : {}),
          ...(typeof purpose === "string" ? { purpose } : {}),
          ...(typeof secPurpose === "string" ? { secPurpose } : {}),
        });
        const envelope = clickEventEnvelopeSchema.parse({ eventId: randomUUID(), linkId: link.id, organizationId: link.organizationId, workspaceId: link.workspaceId, occurredAt: new Date().toISOString(), method: request.method, visitorHash: visitorHash(config.privacyKey, request.ip, request.headers["user-agent"] ?? ""), privacyKeyId: config.privacyKeyId, userAgentClass: traffic.userAgentClass, botReason: traffic.botReason });
        const body = JSON.stringify(envelope);
        const timestamp = String(Math.floor(Date.now() / 1000));
        const signature = createHmac("sha256", config.eventAuthKey).update(`${timestamp}.${body}`).digest("base64url");
        try {
          await fetch(config.ingestionUrl, { method: "POST", headers: { "content-type": "application/json", "x-event-timestamp": timestamp, "x-event-signature": signature }, body, signal: AbortSignal.timeout(75) });
        } catch { /* analytics must not block a valid navigation */ }
        return reply.headers({ "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" }).redirect(link.destinationUrl, 302);
      } catch (error) {
        const status = error instanceof InvalidClickTokenError ? 404 : error instanceof AffiliateLinkNotFoundError ? 410 : 404;
        return reply.status(status).headers({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("text/plain").send("Link unavailable");
      }
    },
  });
  server.get("/health/live", { config: { rateLimit: false } }, async () => ({ status: "ok" }));
  return server;
}
