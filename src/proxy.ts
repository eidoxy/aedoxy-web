import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { decideAdminRequest } from "@/server/admin";

const noStore = { "Cache-Control": "no-store" };

/**
 * /admin/*: real session check (database lookup, Node.js runtime) before anything is rendered, so a
 * non-admin gets a real 404 status and never receives admin HTML. Pages and actions still call
 * requireAdmin() as the second layer.
 * Other panel routes: optimistic gate, only checks that a session cookie exists; the real check runs in
 * the panel layout, pages and actions (src/server/session.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    let decision;
    try {
      decision = decideAdminRequest(await auth.api.getSession({ headers: request.headers }), pathname);
    } catch (err) {
      console.error(`[proxy] admin session check failed reason=${err instanceof Error ? err.message : "unknown"}`);
      return new NextResponse("Service Unavailable", { status: 503, headers: noStore });
    }
    if (decision.kind === "redirect") return NextResponse.redirect(new URL(decision.to, request.url), { headers: noStore });
    // shortcut: a bare 404 body instead of the styled page; a rewrite to a missing path could not be checked without a running server. Switch once verified.
    if (decision.kind === "not_found") return new NextResponse("Not Found", { status: 404, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } });
    return NextResponse.next();
  }

  if (!getSessionCookie(request)) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/plans/:path*", "/orders/:path*", "/settings/:path*", "/admin/:path*"],
};
