"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { pickCta } from "@/lib/cta";

/**
 * Primary marketing button. The page stays static: the HTML always carries the anonymous label, and after
 * hydration the session (read through the auth client, since the cookie is httpOnly) swaps it for "Dashboard".
 * Pass a min-w class wide enough for both labels so the swap does not move the layout.
 */
export function SessionCta({ label, href, className, icon }: { label: string; href: string; className?: string; icon?: React.ReactNode }) {
  const { data } = authClient.useSession();
  const cta = pickCta(Boolean(data?.user), { label, href });
  return (
    <Button asChild className={className}>
      <Link href={cta.href}>
        {cta.label}
        {icon}
      </Link>
    </Button>
  );
}
