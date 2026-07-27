import { z } from "zod";

const configSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    AUTH_MODE: z.enum(["development", "oidc"]).default("development"),
    AUTH_JWKS_URL: z.string().url().optional(),
    AUTH_ISSUER: z.string().url().optional(),
    AUTH_AUDIENCE: z.string().min(1).optional(),
    ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
    DATABASE_URL: z.string().url().optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && value.AUTH_MODE !== "oidc") {
      context.addIssue({
        code: "custom",
        path: ["AUTH_MODE"],
        message: "Production requires OIDC authentication",
      });
    }

    if (value.AUTH_MODE === "oidc") {
      for (const key of ["AUTH_JWKS_URL", "AUTH_ISSUER", "AUTH_AUDIENCE"] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required for OIDC authentication`,
          });
        }
      }
    }

    if (value.NODE_ENV === "production" && !value.DATABASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "Production requires DATABASE_URL",
      });
    }
  });

export type ApiConfig = z.infer<typeof configSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return configSchema.parse(environment);
}
