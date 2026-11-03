"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signInErrorMessage } from "@/lib/auth-messages";
import { authClient } from "@/lib/auth-client";
import { SOCIAL_LABEL, type SocialProvider } from "@/lib/social";

/**
 * "atau" divider plus one button per provider, for /login ("Masuk") and /register ("Daftar"). `providers` is what the server
 * offers (configured in env and switched on by the admin); with none, nothing renders. Better Auth creates the account on the
 * first sign-in with a provider, so both pages start the same flow.
 *
 * Inside the console's OIDC flow (the page URL carries the signed `sig` query) nothing extra is needed here: the client plugin
 * adds that signed query to the request, the server remembers it across the provider round trip and continues to /oauth2/authorize
 * after the session exists. `callbackURL` is only where a normal visit lands. Failures come back to /login with the same query.
 */
export function SocialButtons({ providers, verb, onError }: { providers: SocialProvider[]; verb: "Masuk" | "Daftar"; onError: (message?: string) => void }) {
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  if (providers.length === 0) return null;

  async function start(provider: SocialProvider) {
    onError(undefined);
    setBusy(provider);
    const back = new URLSearchParams(window.location.search);
    back.delete("error");
    back.delete("error_description");
    const { error } = await authClient.signIn.social({ provider, callbackURL: "/dashboard", errorCallbackURL: `/login${back.size ? `?${back}` : ""}` });
    // On success the browser is already leaving for the provider; keep the button disabled until it does.
    if (error) {
      setBusy(null);
      onError(signInErrorMessage(error, `${verb} dengan ${SOCIAL_LABEL[provider]} gagal. Coba lagi.`));
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 text-xs text-faint" role="separator">
        <span className="h-px flex-1 bg-line" />
        atau
        <span className="h-px flex-1 bg-line" />
      </div>
      {providers.map((p) => (
        <Button key={p} type="button" variant="outline" onClick={() => start(p)} disabled={busy !== null} className="mt-2 h-11 w-full bg-surface text-sm font-semibold">
          {busy === p && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {verb} dengan {SOCIAL_LABEL[p]}
        </Button>
      ))}
    </div>
  );
}
