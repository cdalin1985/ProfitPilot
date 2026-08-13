import { z } from "zod";
import { buildRedirectServer } from "./server.js";

const env = z.object({ HOST: z.string().default("127.0.0.1"), PORT: z.coerce.number().default(4100), CLICK_SIGNING_KEY_ID: z.string().default("development"), CLICK_SIGNING_KEY: z.string().min(43), CLICK_PRIVACY_HASH_KEY: z.string().min(32), CLICK_PRIVACY_KEY_ID: z.string().default("v1"), CLICK_EVENT_AUTH_KEY: z.string().min(32), CLICK_INGESTION_URL: z.string().url().default("http://127.0.0.1:4200/internal/v1/click-events") }).parse(process.env);
const server = await buildRedirectServer({ signingKeys: { [env.CLICK_SIGNING_KEY_ID]: env.CLICK_SIGNING_KEY }, privacyKey: env.CLICK_PRIVACY_HASH_KEY, privacyKeyId: env.CLICK_PRIVACY_KEY_ID, eventAuthKey: env.CLICK_EVENT_AUTH_KEY, ingestionUrl: env.CLICK_INGESTION_URL });
await server.listen({ host: env.HOST, port: env.PORT });
