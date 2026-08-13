import { z } from "zod";
import { buildEventIngestionServer } from "./server.js";
const env = z
  .object({
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().default(4200),
    CLICK_EVENT_AUTH_KEY: z.string().min(32),
  })
  .parse(process.env);
const server = await buildEventIngestionServer(env.CLICK_EVENT_AUTH_KEY);
await server.listen({ host: env.HOST, port: env.PORT });
