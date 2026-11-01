"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" onClick={signOut} disabled={pending} className="h-10 bg-surface px-4 text-sm font-semibold">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Keluar
    </Button>
  );
}
