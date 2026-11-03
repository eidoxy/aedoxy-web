# Deploy produksi

Satu stack Docker Compose di VPS (`~/aedoxy-web`): Postgres, Redis, gateway-aedoxy, web, worker, dan `cloudflared`. Tidak ada port yang dipublikasikan ke host. Semua lalu lintas masuk lewat Cloudflare Tunnel.

## Penamaan

- Kunci service gateway di compose tetap `new-api`. Kunci ini sengaja dipertahankan karena `gateway-aedoxy/.github/workflows/deploy.yml` menjalankan `docker compose pull new-api`, dan repo gateway melindungi nama tersebut. Kalau pemilik ingin mengganti kunci service, ia harus mengubah `deploy.yml` gateway sendiri.
- Container, alias jaringan, dan host internal bernama `gateway-aedoxy` (`NEWAPI_INTERNAL_URL=http://gateway-aedoxy:3000`).
- Database gateway: `gateway-aedoxy` (pakai tanda kutip ganda di SQL). Database web: `aedoxy`, dimiliki role `aedoxy` (bukan superuser).

## Cloudflare Tunnel

Ingress diatur di dashboard Cloudflare (Zero Trust > Networks > Tunnels), bukan di berkas ini:

| Hostname | Service |
|---|---|
| `aedoxy.com` | `http://web:3000` |
| `ai.aedoxy.com` | `http://gateway-aedoxy:3000` |

Token tunnel masuk ke `CLOUDFLARE_TUNNEL_TOKEN`. Tidak ada Caddy. Endpoint bridge `/api/aedoxy` pada gateway tidak boleh diekspos publik: tambahkan aturan WAF/Access di Cloudflare untuk path itu, karena Caddyfile lama yang memblokirnya tidak dipakai lagi. `TRUSTED_PROXIES` dikunci ke subnet jaringan compose (`172.28.0.0/16`).

## Deploy pertama

```sh
mkdir -p ~/aedoxy-web/postgres-init && cd ~/aedoxy-web
# salin dari repo: docker-compose.prod.yml -> docker-compose.yml, .env.example -> .env, postgres-init/10-aedoxy.sh
cp .env.example .env && chmod 600 .env   # isi semua nilai kosong (openssl rand -hex 24)
sudo docker login ghcr.io                # token dengan scope read:packages bila image privat

sudo docker compose up -d postgres redis        # init membuat role dan database aedoxy
sudo docker compose run --rm migrate            # migrasi web
sudo docker compose run --rm migrate node scripts/seed-oauth-client.js   # mencetak CONSOLE_OIDC_CLIENT_SECRET sekali
```

`GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` opsional: kosongkan keduanya untuk menonaktifkan masuk dengan Google (isi keduanya atau tidak sama sekali; salah satu saja ditolak saat start). Email memakai SMTP, lihat bagian [Email](#email). Isi rahasia hanya di `.env` di VPS.

`GITHUB_CLIENT_ID` dan `GITHUB_CLIENT_SECRET` juga opsional dengan aturan pasangan yang sama; tombol "Masuk dengan GitHub" hanya muncul bila keduanya terisi. Membuat GitHub OAuth App: GitHub > Settings > Developer settings > OAuth Apps > New OAuth App. Isi Homepage URL `https://aedoxy.com` dan Authorization callback URL `https://aedoxy.com/api/auth/callback/github` (Better Auth memasang `/callback/:id` di bawah `/api/auth`). Scope yang diminta aplikasi: `read:user user:email`. Salin Client ID, lalu Generate a new client secret, dan isi keduanya di `.env` VPS. Akun GitHub hanya dipakai untuk masuk atau ditautkan bila emailnya terverifikasi di GitHub.

Compose menolak nilai kosong untuk semua perintah, jadi `.env` awal berisi `CONSOLE_OIDC_CLIENT_SECRET=pending`. Jangan jalankan `web` sebelum nilai itu diganti. Salin rahasia yang tercetak ke `.env` (`CONSOLE_OIDC_CLIENT_SECRET`) dan ke pengaturan OAuth di konsol gateway. Redirect URI: `https://ai.aedoxy.com/oauth/aedoxy`. Lalu:

```sh
sudo docker compose run --rm migrate node scripts/seed-catalog.js     # opsional: SEED_POOL_USD=500 untuk saldo pool awal
sudo docker compose up -d
sudo docker compose run --rm migrate node scripts/make-admin.js you@example.com
```

Skrip init Postgres hanya jalan pada volume baru. Untuk volume yang sudah ada, jalankan manual:

```sh
sudo docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
# di psql:
#   CREATE ROLE aedoxy LOGIN NOSUPERUSER PASSWORD '<AEDOXY_DB_PASSWORD>';
#   CREATE DATABASE aedoxy OWNER aedoxy;
# bila database gateway masih bernama lama: ALTER DATABASE "new-api" RENAME TO "gateway-aedoxy";  (putuskan semua koneksi dulu)
```

Image Postgres dipatok ke `postgres:15` agar cocok dengan volume `pg_data` instalasi gateway yang sudah ada. Redis dibatasi `maxmemory 96mb` dengan eviction LRU supaya muat di `mem_limit` 128m.

## Email

Isi kolom `EMAIL_SMTP_*` di `.env` (diutamakan) atau, sebagai alternatif, satu `EMAIL_SERVER_URL` (URL SMTP nodemailer, kredensial di-URL-encode). Salah satu wajib saat `ENV_STRICT=true`; bila `EMAIL_SMTP_HOST` terisi, `EMAIL_SERVER_URL` diabaikan. `EMAIL_FROM` wajib. Beri kutip bila ada spasi atau tanda `<>`: `EMAIL_FROM="Aedoxy <no-reply@aedoxy.com>"`.

Pemetaan dari halaman email di console gateway:

| Console gateway | Variabel |
|---|---|
| SMTPServer | `EMAIL_SMTP_HOST` |
| SMTPPort | `EMAIL_SMTP_PORT` |
| SMTPAccount | `EMAIL_SMTP_USER` |
| SMTPToken | `EMAIL_SMTP_PASSWORD` |
| SSL aktif | `EMAIL_SMTP_TLS=ssl` (port 465) |
| SSL mati | `EMAIL_SMTP_TLS=starttls` (port 587, TLS wajib) |

`EMAIL_SMTP_USER` dan `EMAIL_SMTP_PASSWORD` diisi berpasangan atau dikosongkan keduanya. `EMAIL_SMTP_TLS=none` hanya untuk server uji lokal dan ditolak saat `ENV_STRICT=true`.

Preset Mailtrap:

| Preset | Host | Port | User | Password | Catatan |
|---|---|---|---|---|---|
| Sending | `live.smtp.mailtrap.io` | 587 | `api` | token API | Domain pengirim harus terverifikasi di Mailtrap, dan `EMAIL_FROM` memakai domain itu. |
| Sandbox | `sandbox.smtp.mailtrap.io` | 2525 | user inbox | password inbox | Hanya menangkap email, tidak mengirim ke penerima nyata. |

Uji kirim setelah mengisi `.env`:

```sh
sudo docker compose run --rm migrate node scripts/send-test-email.js alamat@contoh.com
```

Skrip mencetak `terkirim` atau `send-test-email failed: SMTP send failed (<kode> <kode respons>)` dan keluar dengan kode 0 atau 1. Contoh: `EAUTH 535` kredensial salah, `EENVELOPE 550` pengirim atau penerima ditolak (domain pengirim belum terverifikasi), `ESOCKET`/`ETIMEDOUT` host atau port tidak terjangkau. Pesan tidak memuat host, kredensial, atau alamat penerima.

Kegagalan kirim saat aplikasi berjalan tercatat sebagai `[auth] email failed reason=...` dengan kode yang sama:

```sh
sudo docker compose logs web | grep "email failed"
```

## Batas laju dan IP klien

Batas laju disimpan di Postgres, bukan di memori proses atau Redis: tabel `rate_limits` (batas aplikasi) dan `rate_limit` (batas HTTP Better Auth), dibuat oleh migrasi `0008`. Tidak ada variabel env baru dan tidak ada layanan baru. Karena penghitung ada di database, restart `web` tidak mereset batas dan lebih dari satu instance web berbagi batas yang sama. Worker menjalankan tugas `rate-limit-cleanup` tiap 60 menit untuk menghapus penghitung yang lebih tua dari satu jam.

Urutan deploy: `migrate` dulu, lalu `up -d --no-deps web worker`. Web versi baru tanpa migrasi `0008` menolak pembuatan order, kode 2FA, dan trust device (batas aplikasi gagal tertutup) dan endpoint auth HTTP mengembalikan error karena tabel `rate_limit` belum ada, sedangkan feed publik tetap jalan. Workflow `deploy.yml` sudah berurutan seperti ini.

Alamat klien dibaca hanya dari `cf-connecting-ip` (ditulis Cloudflare). Pastikan tidak ada port web yang terpublikasi ke host, karena di luar Cloudflare header itu bisa dipalsukan. Gateway memanggil `/api/auth/oauth2/token`, `/oauth2/userinfo`, dan `/jwks` dari IP publik VPS, jadi semua login konsol berbagi satu ember per jalur (diberi batas 600 per menit).

## Perintah operator

```sh
cd ~/aedoxy-web
sudo docker compose ps
sudo docker compose logs -f --tail=100 web worker
sudo docker compose run --rm migrate node scripts/make-admin.js <email>
sudo docker compose run --rm migrate node scripts/reset-2fa.js <email>
sudo docker compose run --rm migrate node scripts/ban-user.js <email> [alasan]   # keluarkan sesi, nonaktifkan akun console
sudo docker compose run --rm migrate node scripts/unban-user.js <email>
sudo docker compose run --rm migrate node scripts/seed-catalog.js
sudo docker compose run --rm migrate node scripts/seed-oauth-client.js   # NODE_ENV=production: rahasia baru dicetak ke stdout
```

Alasan ban ditampilkan ke pengguna di halaman masuk ("Akun Anda diblokir. Alasan: ..."), jadi tulis alasan yang aman dibaca (maksimal 200 karakter; catatan internal jangan ditaruh di sini). Pesan itu hanya muncul setelah kata sandi, passkey, atau penyedia login sosial diterima, sehingga tidak membocorkan apakah sebuah akun ada. Setelah login sosial, halaman masuk hanya menampilkan pemberitahuan blokir tanpa alasan.

`ban-user` mencetak `console: dinonaktifkan` bila console sudah mengikuti, atau `console: tertunda, worker akan mengulang` bila bridge gagal (ban tetap berlaku di aedoxy.com, worker `sync-console-status` mengulang tiap menit). Admin atau Root di console dilindungi bridge (HTTP 409): ban tetap tercatat, tetapi akun console-nya tidak dinonaktifkan dan worker mencatat `protected:http:409` tiap menit sampai peran itu diturunkan di console.

`SEED_OAUTH_OUT=<path>` menulis rahasia ke berkas, `SEED_OAUTH_OUT=-` memaksa stdout. Rahasia hanya muncul sekali saat klien dibuat (tersimpan sebagai hash).

## CI/CD dan rollback

Workflow `.github/workflows/deploy.yml` berjalan pada push ke `main`: tes, build dan push image ke GHCR (`:<sha>` dan `:latest`), lalu SSH ke VPS: `pull`, `migrate`, `up -d --no-deps web worker`. Deploy berhenti bila migrasi gagal.

Secret (Settings > Secrets, environment `production`): `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `SSH_PORT`.
Variable (Settings > Variables): `NEXT_PUBLIC_SITE_URL` (mis. `https://aedoxy.com`), `NEWAPI_PUBLIC_URL` (mis. `https://ai.aedoxy.com`). Keduanya tertanam saat build, jadi mengubahnya butuh build ulang.

Rollback ke versi sebelumnya (tag = SHA commit):

```sh
cd ~/aedoxy-web
sudo env WEB_TAG=<sha-lama> docker compose up -d --no-deps web worker
```

Migrasi tidak dibalik otomatis. Migrasi yang sudah berlaku harus kompatibel dengan versi lama, atau pulihkan dari backup (`pg_dump`) sebelum rollback. Tanpa `WEB_TAG`, `up -d` memakai `:latest`; isi `WEB_TAG` di `.env` bila ingin mengunci versi.
