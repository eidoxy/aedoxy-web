# F00 Fondasi: Akun Tunggal, Integrasi Console, Deployment

Prioritas P0 · Rilis R0 · Acuan: `../TRD.md` bagian 2 (D3, D4), 7, 11, 12

## Tujuan

- Satu akun Aedoxy dipakai di aedoxy.com dan ai.aedoxy.com.
- aedoxy.com bisa mengaktifkan paket di akun console secara idempoten.
- Proyek Next.js, database, worker, dan Caddy berjalan di staging.

## Alur login ke console

1. User mendaftar di aedoxy.com, lalu memverifikasi email (atau login dengan Google).
2. Setelah email terverifikasi, server memanggil `POST /api/aedoxy/accounts/ensure` dan menyimpan `newapi_user_id`. Panggilan diulang saat order pertama atau "Buka Console" bila sebelumnya gagal.
3. "Buka Console" mengarahkan user ke route login custom OAuth New API untuk provider `aedoxy`.
4. New API mengarahkan ke halaman otorisasi aedoxy.com. Karena user sudah login, halaman ini langsung kembali ke New API tanpa form login. Consent bisa dilewati untuk client pihak pertama.
5. New API menemukan binding `aedoxy`/`sub`, sehingga user langsung masuk.

## Akun console lama

Tidak ada. Console sebelumnya (`ai.obersa.my.id`) hanya berganti domain dan tidak punya user, jadi login password untuk user biasa bisa langsung dimatikan. `ensure` tidak pernah mencocokkan user berdasarkan email, karena pencocokan seperti itu membuka celah pengambilalihan akun.

## Tugas

Ukuran: S ≤ 1 hari, M 2–3 hari, L 4–7 hari. Ini perkiraan untuk satu developer.

| # | Tugas | Ukuran |
|---|---|---|
| 1 | Inisialisasi Next.js + TypeScript strict + Tailwind 4 + shadcn/ui + Bun. Validasi env dengan Zod di `env.ts` | S |
| 2 | Drizzle + migrasi awal + DB `aedoxy` dan user DB terpisah di Postgres yang ada | S |
| 3 | Better Auth: email/password + verifikasi email, Google, plugin `admin` dan `twoFactor`, halaman auth | M |
| 4 | Plugin OAuth 2.1 Provider + client "gateway-aedoxy" (redirect URI persis, PKCE), halaman consent/skip | M |
| 5 | Fork Go: `model/aedoxy_bridge.go`, `controller/aedoxy_bridge.go`, 2 route, 2 aturan scope, test di tiga database (`../TRD.md` 7.1) | L |
| 6 | Konfigurasi New API: custom OAuth "Aedoxy", matikan sumber kredit di luar pool, `TopUpLink`, akun layanan `aedoxy-bridge` + access token (`../TRD.md` 7.3) | S |
| 7 | `integrations/newapi.ts`: klien bridge + endpoint admin, timeout 5 detik, error bertipe | S |
| 8 | `ensureConsoleAccount()` setelah verifikasi email, diulang saat order pertama atau "Buka Console" bila gagal | S |
| 9 | Layout panel + tombol "Buka Console" + kartu paket aktif (`GET /api/subscription/admin/users/:id/subscriptions`) | S |
| 10 | Dockerfile (output `standalone`), service `aedoxy-web` dan `aedoxy-worker`, Caddyfile baru dengan blok `/api/aedoxy/*` | M |
| 11 | Ganti password default Postgres/Redis, backup database sebelum migrasi | S |
| 12 | Kerangka admin: guard peran + 2FA, `admin_audit_log`, layout | S |

## Selesai bila

- Akun baru di aedoxy.com bisa membuka console tanpa login ulang, dan muncul sebagai satu user di New API dengan binding `aedoxy`.
- `fulfill` yang dipanggil dua kali dengan `trade_no` sama hanya membuat satu subscription (diuji di SQLite, MySQL, PostgreSQL).
- `curl https://ai.aedoxy.com/api/aedoxy/fulfill` dari internet mendapat 404.
- Aplikasi gagal start bila ada secret yang kosong.

## Risiko dan catatan

- `AGENTS.md` fork mewajibkan kepatuhan OWASP ASVS untuk perubahan alur auth. Bridge tidak mengubah alur login, tetapi membuat user dan binding, jadi ikuti aturan yang relevan dan catat di PR.
- Atribusi New API dan QuantumNous di console tidak boleh dihapus (aturan proyek dan AGPL-3.0). Aplikasi Next.js adalah program terpisah yang berkomunikasi lewat HTTP.
- Merge dari upstream bisa konflik di `router/api-router.go` dan `middleware/access_token_routes.go`. Konfliknya kecil karena masing-masing hanya bertambah dua baris.
