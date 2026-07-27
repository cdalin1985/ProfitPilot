export type WebAuthMode = "development" | "oidc";

export function getWebAuthMode(): WebAuthMode {
  const mode = process.env.AUTH_MODE;
  if (mode === "oidc") {
    return mode;
  }
  if (mode === "development" && process.env.NODE_ENV !== "production") {
    return mode;
  }
  if (!mode && process.env.NODE_ENV !== "production") {
    return "development";
  }

  throw new Error("AUTH_MODE=oidc is required for production web authentication");
}
