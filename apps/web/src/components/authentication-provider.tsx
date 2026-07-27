import { withAuth } from "@workos-inc/authkit-nextjs";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";

import { getWebAuthMode } from "@/lib/auth-mode";

export async function AuthenticationProvider({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactNode> {
  if (getWebAuthMode() === "development") {
    return children;
  }

  const initialAuth = { ...(await withAuth()) };
  Reflect.deleteProperty(initialAuth, "accessToken");
  return <AuthKitProvider initialAuth={initialAuth}>{children}</AuthKitProvider>;
}
