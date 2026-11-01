import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

/** Real session check (database lookup). Reads request headers, so call it inside <Suspense>. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Use in every panel page, layout and server action: the proxy only checks that a cookie exists. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
