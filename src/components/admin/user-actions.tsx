"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { banUserAction, revokeSessionsAction, setUserRoleAction, unbanUserAction } from "@/app/(admin)/admin/users/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AdminFormState } from "@/server/admin-action";
import { Field } from "./common";
import { FormResult } from "./totp-field";

type FormAction = (prev: AdminFormState, fd: FormData) => Promise<AdminFormState>;

/** A confirmation dialog around one server action. No 2FA code: these are account-management actions of a signed-in admin. */
function ActionDialog({
  action,
  userId,
  trigger,
  title,
  description,
  submit,
  destructive = false,
  children,
}: {
  action: FormAction;
  userId: string;
  trigger: string;
  title: string;
  description: React.ReactNode;
  submit: string;
  destructive?: boolean;
  children?: (state: AdminFormState) => React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant={destructive ? "destructive" : "outline"} size="sm">
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ActionForm action={action} userId={userId} submit={submit} destructive={destructive}>
          {children}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

/** Lives inside DialogContent, so its state is fresh each time the dialog opens. The dialog stays open after success so the result line (console status, revoked sessions) is readable. */
function ActionForm({ action, userId, submit, destructive, children }: { action: FormAction; userId: string; submit: string; destructive: boolean; children?: (state: AdminFormState) => React.ReactNode }) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      {children?.(state)}
      <FormResult error={state.error} ok={state.ok} />
      <DialogFooter>
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending || Boolean(state.ok)} className="h-10 px-4 text-sm font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function UserActions({ userId, isSelf, banned, role, label }: { userId: string; isSelf: boolean; banned: boolean; role: "user" | "admin"; label: string }) {
  const nextRole = role === "admin" ? "user" : "admin";
  return (
    <div className="flex flex-wrap gap-2">
      {banned ? (
        <ActionDialog action={unbanUserAction} userId={userId} trigger="Buka blokir" title={`Buka blokir ${label}?`} description="Pengguna bisa masuk lagi dan akun console diaktifkan kembali." submit="Buka blokir" />
      ) : (
        !isSelf && (
          <ActionDialog
            action={banUserAction}
            userId={userId}
            trigger="Blokir"
            destructive
            title={`Blokir ${label}?`}
            description={
              <>
                Semua sesi pengguna dicabut dan akun console dinonaktifkan. Alasan tampil ke pengguna di halaman masuk.
                {role === "admin" && " Console menolak menonaktifkan admin console (409): blokir tetap berlaku di sini, tetapi turunkan perannya di console agar akunnya ikut nonaktif."}
              </>
            }
            submit="Blokir pengguna"
          >
            {(state) => (
              <>
                <Field label="Alasan (wajib)" htmlFor={`ban-reason-${userId}`} error={state.fieldErrors?.reason?.[0]}>
                  <Textarea id={`ban-reason-${userId}`} name="reason" required maxLength={200} rows={3} className="bg-background" />
                </Field>
                <Field label="Berakhir pada (opsional)" htmlFor={`ban-until-${userId}`} hint="Kosongkan untuk blokir tanpa batas waktu." error={state.fieldErrors?.until?.[0]}>
                  <Input id={`ban-until-${userId}`} name="until" type="date" className="h-9 bg-background" />
                </Field>
              </>
            )}
          </ActionDialog>
        )
      )}
      {!isSelf && (
        <ActionDialog action={setUserRoleAction} userId={userId} trigger={`Jadikan ${nextRole}`} title={`Ubah peran ${label} menjadi ${nextRole}?`} description={nextRole === "admin" ? "Admin bisa mengubah paket, harga, pool, dan pengguna. Admin wajib mengaktifkan 2FA." : "Akses admin dicabut. Admin terakhir tidak bisa diturunkan."} submit={`Jadikan ${nextRole}`}>
          {() => <input type="hidden" name="role" value={nextRole} />}
        </ActionDialog>
      )}
      <ActionDialog action={revokeSessionsAction} userId={userId} trigger="Keluarkan dari semua perangkat" title={`Keluarkan ${label}?`} description="Semua sesi aktif dicabut. Pengguna harus masuk lagi." submit="Keluarkan" />
    </div>
  );
}
