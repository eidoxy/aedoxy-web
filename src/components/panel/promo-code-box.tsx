"use client";

import { Loader2, Tag } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { applyPromoAction, type ApplyPromoState } from "@/app/(panel)/plans/actions";
import { FormMessage } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** "Kode promo" field. The server checks the code; a usable one reloads /plans with the discounted prices. */
export function PromoCodeBox({ appliedCode }: { appliedCode?: string }) {
  const [state, action, pending] = useActionState<ApplyPromoState, FormData>(applyPromoAction, {});
  return (
    <form action={action} className="mt-6 max-w-md">
      <label htmlFor="kode" className="mono-label mb-1.5 flex items-center gap-1.5">
        <Tag className="size-3.5" aria-hidden /> Kode promo
      </label>
      <div className="flex gap-2">
        <Input
          id="kode"
          name="kode"
          defaultValue={appliedCode ?? ""}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Punya kode promo?"
          className="h-10 bg-background"
        />
        <Button type="submit" variant="outline" disabled={pending} className="h-10 px-4 text-sm font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Terapkan
        </Button>
      </div>
      <FormMessage tone="error">{state.error}</FormMessage>
      {appliedCode && !state.error && (
        <p className="mt-2 text-sm text-fg-muted">
          Kode <span className="font-mono text-heading">{appliedCode}</span> diterapkan.{" "}
          <Link href="/plans" className="text-primary-ink underline-offset-4 hover:underline">
            Hapus kode
          </Link>
        </p>
      )}
    </form>
  );
}
