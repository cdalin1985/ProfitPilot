import { createHmac, timingSafeEqual } from "node:crypto";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { clickEventEnvelopeSchema, clickEventResultSchema } from "@profit-pilot/contracts";
import { ingestClickEvent } from "@profit-pilot/db";

function authentic(body: string, timestamp: string, signature: string, key: string): boolean {
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", key).update(`${timestamp}.${body}`).digest();
  const supplied = Buffer.from(signature, "base64url");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function buildEventIngestionServer(eventAuthKey: string): Promise<FastifyInstance> {
  const server = Fastify({ logger: true, bodyLimit: 16_384, trustProxy: true });
  await server.register(helmet);
  await server.register(rateLimit, { max: 2_000, timeWindow: "1 minute" });
  server.removeContentTypeParser("application/json");
  server.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => done(null, body));
  server.post("/internal/v1/click-events", async (request, reply) => {
    const body = String(request.body ?? "");
    const timestamp = String(request.headers["x-event-timestamp"] ?? "");
    const signature = String(request.headers["x-event-signature"] ?? "");
    if (!authentic(body, timestamp, signature, eventAuthKey)) return reply.status(401).send({ error: "unauthorized" });
    const result = clickEventResultSchema.parse(await ingestClickEvent(clickEventEnvelopeSchema.parse(JSON.parse(body))));
    return reply.status(result.replayed ? 200 : 201).send(result);
  });
  server.get("/health/live", { config: { rateLimit: false } }, async () => ({ status: "ok" }));
  return server;
}
