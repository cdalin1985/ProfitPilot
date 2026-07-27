import { authkitProxy } from "@workos-inc/authkit-nextjs";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getWebAuthMode } from "@/lib/auth-mode";

const workosProxy = authkitProxy({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/sign-in", "/auth/callback"],
  },
  signUpPaths: ["/sign-up"],
});

export default function proxy(
  request: NextRequest,
  event: NextFetchEvent,
): ReturnType<typeof workosProxy> {
  if (getWebAuthMode() === "development") {
    return NextResponse.next();
  }
  return workosProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
