"use client";

import { createContext, useContext } from "react";

// Without a provider the answer is "yes": showing a button that may fail is safer than hiding a working one.
const HasPasskeyContext = createContext(true);

/** Whether the signed-in admin has a passkey. Set by the admin shell from the database, only used to hide the passkey button. */
export function HasPasskeyProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <HasPasskeyContext value={value}>{children}</HasPasskeyContext>;
}

export const useHasPasskey = () => useContext(HasPasskeyContext);
