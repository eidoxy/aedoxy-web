"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { encode } from "uqr";
import { FormMessage, TextField } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Draws the QR as one SVG path (no innerHTML). Runs of dark modules become one rectangle each. */
function QrCode({ text }: { text: string }) {
  const { data, size } = encode(text, { ecc: "M", border: 2 });
  let d = "";
  data.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let end = x;
      while (end + 1 < row.length && row[end + 1]) end++;
      d += `M${x} ${y}h${end - x + 1}v1h-${end - x + 1}z`;
      x = end;
    }
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Kode QR untuk aplikasi autentikator" shapeRendering="crispEdges" className="size-52 rounded-lg border border-line">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

type Step = { name: "password" } | { name: "verify"; uri: string; codes: string[] } | { name: "done"; codes: string[] };

/** Enrols TOTP for the signed-in admin. Backup codes are shown once, after the first code verifies. */
export function TwoFactorSetup() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "password" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    setPassword("");
    if (err || data?.method !== "totp") return setError(err?.status === 400 ? "Kata sandi salah." : "Gagal memulai pendaftaran 2FA. Coba lagi.");
    setStep({ name: "verify", uri: data.totpURI, codes: data.backupCodes });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (step.name !== "verify") return;
    setBusy(true);
    setError(undefined);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s+/g, "") });
    setBusy(false);
    if (err) return setError("Kode salah atau kedaluwarsa. Periksa jam perangkat Anda lalu coba lagi.");
    setStep({ name: "done", codes: step.codes });
  }

  if (step.name === "password") {
    return (
      <form onSubmit={enable} className="max-w-sm space-y-1">
        <TextField id="password" label="Kata sandi akun" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <FormMessage tone="error">{error}</FormMessage>
        <Button type="submit" disabled={busy || !password} className="h-10 px-4 text-sm font-semibold">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Mulai pendaftaran 2FA
        </Button>
      </form>
    );
  }

  if (step.name === "verify") {
    const secret = new URL(step.uri).searchParams.get("secret");
    return (
      <form onSubmit={verify} className="space-y-4">
        <p className="text-sm text-fg-muted">Pindai kode QR dengan aplikasi autentikator (Google Authenticator, Authy, 1Password), lalu masukkan kode 6 digit yang muncul.</p>
        <QrCode text={step.uri} />
        {secret && (
          <p className="text-xs text-faint">
            Tidak bisa memindai? Masukkan kunci ini secara manual: <code className="font-mono break-all text-fg-soft">{secret}</code>
          </p>
        )}
        <div className="max-w-xs">
          <TextField id="code" label="Kode 6 digit" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required />
          <FormMessage tone="error">{error}</FormMessage>
          <Button type="submit" disabled={busy || code.replace(/\s+/g, "").length !== 6} className="h-10 px-4 text-sm font-semibold">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Verifikasi dan aktifkan
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-soft">2FA aktif. Simpan kode cadangan ini sekarang di tempat aman. Kode hanya ditampilkan sekali, dan tiap kode hanya berlaku satu kali.</p>
      <ul className="grid max-w-md grid-cols-2 gap-2 rounded-xl border border-line bg-alt p-4 font-mono text-sm text-heading">
        {step.codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Button onClick={() => router.push("/admin")} className="h-10 px-4 text-sm font-semibold">
        Saya sudah menyimpannya, lanjut ke admin
      </Button>
    </div>
  );
}
