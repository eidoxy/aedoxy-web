import { redirect } from "next/navigation";
import { signedInDestination } from "@/lib/auth-redirect";
import { getSession } from "@/server/session";

/**
 * Sends a visitor with a valid session away from /login, /register and /forgot-password, on the server,
 * so the form never flashes. Reads cookies and search params: render it inside <Suspense> with a skeleton.
 */
export async function SignedInGate({
  searchParams,
  children,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  children: React.ReactNode;
}) {
  const [params, session] = await Promise.all([searchParams, getSession()]);
  if (session) {
    const to = signedInDestination(params);
    if (to) redirect(to);
  }
  return children;
}
