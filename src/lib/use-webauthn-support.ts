import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** False in a browser without WebAuthn. The server snapshot says true so the first paint matches. */
export function useWebAuthnSupport() {
  return useSyncExternalStore(
    noop,
    () => typeof window.PublicKeyCredential !== "undefined",
    () => true,
  );
}
