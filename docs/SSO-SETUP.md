# Setup SSO: aedoxy.com sebagai identity provider untuk console

aedoxy.com (Better Auth, plugin `oauthProvider`) menjadi OIDC provider. Console New API memakai fitur **Custom OAuth provider** dengan slug `aedoxy`. Dokumen ini berisi nilai persis yang diisi di panel admin New API.

## 1. Siapkan sisi aedoxy.com

1. Isi `.env.local` (nama variabel ada di `.env.example`): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `NEWAPI_PUBLIC_URL`, `NEWAPI_INTERNAL_URL`, `NEWAPI_BRIDGE_TOKEN`.
2. Terapkan migrasi: `bunx --bun drizzle-kit migrate`.
3. Daftarkan client OIDC (idempoten, aman diulang): `bun scripts/seed-oauth-client.ts`.
   - Client baru dibuat sekali. Secret ditulis ke `.env.local` sebagai `CONSOLE_OIDC_CLIENT_SECRET` dan tidak pernah dicetak.
   - Di database secret hanya tersimpan sebagai hash. Bila `.env.local` hilang, secret tidak bisa dibaca ulang: hapus baris `aedoxy-console` di tabel `oauth_client`, lalu jalankan skrip lagi dan perbarui secret di New API.
4. Salin nilai `CONSOLE_OIDC_CLIENT_SECRET` dari `.env.local` ke kolom Client Secret di New API (langkah 2). Jangan kirim lewat chat atau commit.

Pengaturan client yang dibuat skrip:

| Field | Nilai |
|---|---|
| `client_id` | `aedoxy-console` (env `CONSOLE_OIDC_CLIENT_ID`) |
| Tipe | confidential, `token_endpoint_auth_method=client_secret_post` |
| `redirect_uri` | `{NEWAPI_PUBLIC_URL}/oauth/aedoxy`, persis, satu-satunya |
| Grant | `authorization_code` |
| Scope | `openid profile email` |
| `require_pkce` | `false` (klien OAuth generik New API tidak mengirim PKCE) |
| `skip_consent` | `true` (client pihak pertama, tanpa layar consent) |

## 2. Isi di admin New API

Menu: Pengaturan, Sistem, Custom OAuth provider, tambah provider.

| Field | Nilai |
|---|---|
| Name | `Aedoxy` |
| Slug | `aedoxy` (harus persis, bridge `accounts/ensure` mencari provider ini) |
| Client ID | `aedoxy-console` |
| Client Secret | nilai `CONSOLE_OIDC_CLIENT_SECRET` |
| Authorization endpoint | lihat tabel endpoint |
| Token endpoint | lihat tabel endpoint |
| User info endpoint | lihat tabel endpoint |
| Scopes | `openid profile email` |
| `user_id_field` | `sub` |
| `email_field` | `email` |
| `username_field` | `name` |
| `display_name_field` | `name` |
| Auth style | `1` (client_id dan client_secret di body POST). `0` (auto) juga jalan; `2` (Basic) didukung server tetapi tidak dipakai |
| Enabled | aktif |

Syarat tambahan: setting sistem **`ServerAddress`** di New API harus sama persis dengan URL publik console (`NEWAPI_PUBLIC_URL`, tanpa slash di akhir). New API membentuk `redirect_uri` sebagai `{ServerAddress}/oauth/aedoxy`, dan server menolak bila tidak sama dengan yang terdaftar.

## 3. Endpoint

Better Auth berjalan di base path `/api/auth`. Nilai di bawah diambil dari respons nyata `/.well-known/openid-configuration`.

| Endpoint | Lokal (`http://localhost:3000`) | Produksi (`https://aedoxy.com`) |
|---|---|---|
| Issuer | `http://localhost:3000/api/auth` | `https://aedoxy.com/api/auth` |
| Authorization | `http://localhost:3000/api/auth/oauth2/authorize` | `https://aedoxy.com/api/auth/oauth2/authorize` |
| Token | `http://localhost:3000/api/auth/oauth2/token` | `https://aedoxy.com/api/auth/oauth2/token` |
| UserInfo | `http://localhost:3000/api/auth/oauth2/userinfo` | `https://aedoxy.com/api/auth/oauth2/userinfo` |
| JWKS | `http://localhost:3000/api/auth/jwks` | `https://aedoxy.com/api/auth/jwks` |
| Discovery (OIDC) | `http://localhost:3000/api/auth/.well-known/openid-configuration` | `https://aedoxy.com/api/auth/.well-known/openid-configuration` |
| Discovery (RFC 8414) | `http://localhost:3000/api/auth/.well-known/oauth-authorization-server` | `https://aedoxy.com/api/auth/.well-known/oauth-authorization-server` |

Host di tabel mengikuti `BETTER_AUTH_URL` (fallback `NEXT_PUBLIC_SITE_URL`). Bila host produksi berbeda, ganti host-nya saja; path tetap.

Catatan:
- Access token berupa token opaque (bukan JWT), tipe `Bearer`. UserInfo menerima token itu lewat header `Authorization: Bearer <token>`.
- UserInfo mengembalikan `sub`, `name`, `given_name`, `family_name`, `email`, `email_verified`. `sub` sama dengan id user Better Auth, nilai yang sama dikirim sebagai `subject` ke bridge `accounts/ensure`, sehingga binding di console cocok dengan login.
- Alamat alias RFC 8414 berbasis path (`/.well-known/oauth-authorization-server/api/auth` di root domain) tidak disajikan karena tidak ada route root. New API tidak memakainya.

## 4. Alur login

1. User login di aedoxy.com, tekan **Buka Console** di `/dashboard` (server menautkan akun console bila belum, lalu membuka `{NEWAPI_PUBLIC_URL}/sign-in`).
2. Di halaman console, tekan tombol **Aedoxy**. Memulai OAuth otomatis butuh perubahan frontend console dan belum termasuk di sini.
3. New API mengarahkan ke `/api/auth/oauth2/authorize`. Bila sesi aedoxy.com aktif, langsung kembali ke console dengan `code`. Bila belum, user diarahkan ke `/login` dan setelah masuk alur lanjut sendiri.
4. New API menukar `code` di endpoint token, memanggil UserInfo, lalu mencocokkan binding `aedoxy`/`sub`.

## 5. Troubleshooting

| Gejala | Penyebab dan perbaikan |
|---|---|
| `redirect_uri` mismatch atau `invalid_redirect_uri` | `ServerAddress` di New API tidak sama dengan `NEWAPI_PUBLIC_URL` saat skrip seed dijalankan (termasuk `http` vs `https`, `www`, port, slash akhir). Samakan keduanya. Bila URL publik berubah, hapus baris client di tabel `oauth_client` dan jalankan ulang skrip seed |
| Error PKCE (`PKCE is required for this client`, atau `code_challenge` wajib) | Client tidak memakai `require_pkce=false`. Cek kolom `require_pkce` di `oauth_client` untuk `aedoxy-console`. Bila `true`, perbaiki ke `false` |
| `invalid_client` di endpoint token | Client Secret di New API berbeda dengan `CONSOLE_OIDC_CLIENT_SECRET`, atau Auth style tidak cocok. Pakai `1` atau `0` |
| 401 di UserInfo | Token kedaluwarsa, token bukan milik client ini, atau scope tanpa `openid`. Pastikan Scopes di New API berisi `openid profile email` dan header `Authorization: Bearer` terkirim |
| User masuk console tetapi menjadi akun baru, bukan akun yang sudah ditautkan | `user_id_field` bukan `sub`, atau slug bukan `aedoxy` |
| Mentok di `/login` dan tidak kembali ke console | Email belum diverifikasi, atau cookie sesi aedoxy.com diblokir. `trustedOrigins` harus memuat `NEWAPI_PUBLIC_URL` dan `NEXT_PUBLIC_SITE_URL` |
| "Console belum bisa dihubungi" saat Buka Console | Bridge `accounts/ensure` gagal: cek `NEWAPI_INTERNAL_URL`, `NEWAPI_BRIDGE_TOKEN`, dan provider `aedoxy` sudah dibuat di New API (bila belum, bridge membalas 503) |
