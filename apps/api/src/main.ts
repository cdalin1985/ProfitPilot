import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const config = loadConfig();
const server = await buildServer({ config });

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  server.log.info({ signal }, "shutdown requested");
  await server.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await server.listen({ host: config.HOST, port: config.PORT });
