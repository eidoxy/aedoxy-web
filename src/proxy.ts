import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate: only checks that a session cookie exists, so signed-out
 * visitors never reach the panel. The real session check runs on the server in
 * the panel layout, pages and actions (src/server/session.ts).
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
