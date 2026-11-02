import { AdminError } from "@/server/domain/audit";

/** What every admin form action returns to useActionState. */
export type AdminFormState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Set when the server needs the admin to confirm something first (e.g. a credit change on a sold plan). */
  confirm?: string;
};

/**
 * Turns a thrown error into form state. AdminError text is written for the admin; anything else is
 * logged and replaced by a generic line. Next's own control-flow errors (redirect, notFound) are rethrown.
 */
export function toActionError(err: unknown): AdminFormState {
  if (err instanceof AdminError) return { error: err.message };
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
  console.error("[admin] action failed", err instanceof Error ? err.message : "unknown");
  return { error: "Terjadi kesalahan. Coba lagi." };
}

/** FormData -> plain string record (files and repeated keys are ignored). */
export function formStrings(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData) if (typeof v === "string") out[k] = v;
  return out;
}
