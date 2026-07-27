import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { activeWorkspaceCookieName, activeWorkspaceCookiePath } from "@/lib/workspace-cookie";

export function GET(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(activeWorkspaceCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: activeWorkspaceCookiePath,
    expires: new Date(0),
  });
  return response;
}
