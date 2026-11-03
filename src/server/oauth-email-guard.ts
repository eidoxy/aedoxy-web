/**
 * Better Auth treats `account.accountLinking.trustedProviders` as proof of email ownership: with a trusted provider it links a
 * social login to the existing user with the same email even when the provider reports `emailVerified: false`. GitHub reports
 * exactly that for an address that is listed on the account but not confirmed, so anyone could add a victim's email to their
 * GitHub account and take the victim's account over. This `user.validateUserInfo` gate closes it: a social login whose email
 * the provider has not verified can neither create a user nor be linked to one. Returning users (`sign-in`) are not affected.
 */
export function rejectUnverifiedOAuthEmail(data: {
  user: { emailVerified?: unknown };
  source: { action?: string; method?: string };
}): { error: string; errorDescription: string } | undefined {
  const { action, method } = data.source;
  if (method !== "oauth" || (action !== "link-account" && action !== "create-user")) return undefined;
  if (data.user.emailVerified === true) return undefined;
  return { error: "email_not_verified", errorDescription: "The provider has not verified this email address." };
}
