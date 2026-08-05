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
    WORKOS_API_KEY: z.string().startsWith("sk_").optional(),
    WORKOS_OWNER_ROLE_SLUG: z
      .string()
      .regex(/^[a-z0-9_-]+$/)
      .default("admin"),
    AUDIT_IP_HASH_KEY: z.string().min(32).optional(),
    ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
    DATABASE_URL: z.string().url().optional(),
    AWS_REGION: z
      .string()
      .regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/)
      .default("us-east-1"),
    OPENAI_API_KEY_SECRET_REFERENCE: z
      .string()
      .min(1)
      .max(2048)
      .refine((value) => !/[\r\n\0]/.test(value))
      .optional(),
    OPENAI_GENERATION_MODEL: z.string().trim().min(1).max(120).default("gpt-5.6"),
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
      for (const key of [
        "AUTH_JWKS_URL",
        "AUTH_ISSUER",
        "AUTH_AUDIENCE",
        "WORKOS_API_KEY",
      ] as const) {
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

    if (value.NODE_ENV === "production" && !value.AUDIT_IP_HASH_KEY) {
      context.addIssue({
        code: "custom",
        path: ["AUDIT_IP_HASH_KEY"],
        message: "Production requires AUDIT_IP_HASH_KEY",
      });
    }
  });

export type ApiConfig = z.infer<typeof configSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return configSchema.parse(environment);
}
