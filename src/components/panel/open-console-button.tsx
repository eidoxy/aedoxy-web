"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { openConsole, type OpenConsoleState } from "@/app/(panel)/actions";
import { FormMessage } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";

export function OpenConsoleButton() {
  const [state, action, pending] = useActionState<OpenConsoleState>(openConsole, {});
  return (
    <form action={action}>
      <Button type="submit" disabled={pending} className="h-11 px-5 text-sm font-semibold">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Buka Console
        {!pending && <ArrowUpRight className="size-4" aria-hidden />}
      </Button>
      <FormMessage tone="error">{state.error}</FormMessage>
    </form>
  );
}
