import { AppShell } from "@/components/app-shell";
import { getActiveWorkspaceSession } from "@/lib/active-session";
import { requireWebAuth } from "@/lib/auth";
import { routeForIncompleteSession } from "@/lib/session-routing";
import { redirect } from "next/navigation";

export default async function ProductLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactNode> {
  const auth = await requireWebAuth();
  const session = await getActiveWorkspaceSession(auth);
  const nextRoute = routeForIncompleteSession(session);
  if (nextRoute) {
    redirect(nextRoute);
  }
  if (session.status !== "active") {
    redirect("/");
  }

  return (
    <AppShell session={session} user={auth.user}>
      {children}
    </AppShell>
  );
}
