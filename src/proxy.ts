import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { decideAdminRequest } from "@/server/admin";

const noStore = { "Cache-Control": "no-store" };
const UNMATCHED_PATH = "/_aedoxy/404";

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
    // Rewrite to a path no route matches (two segments, so the marketing [stub] route does not catch it): Next answers
    // 404 with the styled app/not-found.tsx, still without any admin HTML or menu.
    if (decision.kind === "not_found") return NextResponse.rewrite(new URL(UNMATCHED_PATH, request.url), { status: 404, headers: noStore });
    return NextResponse.next();
  }

  if (!getSessionCookie(request)) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/plans/:path*", "/orders/:path*", "/settings/:path*", "/admin/:path*"],
};
