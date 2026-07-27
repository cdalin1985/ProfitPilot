import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

export async function GET(): Promise<never> {
  redirect(await getSignInUrl({ returnTo: "/" }));
}
