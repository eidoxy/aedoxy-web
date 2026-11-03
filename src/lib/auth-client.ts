import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, twoFactorClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// oauthProviderClient forwards the signed `oauth_query` so that signing in during an
// OIDC flow (console login) continues back to /oauth2/authorize by itself.
export const authClient = createAuthClient({
  plugins: [oauthProviderClient(), adminClient(), twoFactorClient(), passkeyClient(), usernameClient()],
});
