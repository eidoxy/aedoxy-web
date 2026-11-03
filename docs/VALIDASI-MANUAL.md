# Validasi manual dan skenario uji sebelum push dan deploy

Dokumen ini untuk Anda centang sendiri. Bagian A merangkum perubahan gelombang 5 sampai 8. Bagian B adalah skenario uji berurutan. Bagian C adalah daftar periksa deploy.

Tandai tiap kotak dengan `[x]` bila lulus. Bila ada yang gagal, catat langkah dan hasil yang terlihat.

## A. Ringkasan perubahan

### Gelombang 8 (terbaru)
- **Pengaturan situs** di `/admin/settings` (grup Sistem). Lima bagian: Brand (nama, tagline, deskripsi), Logo dan ikon (logo, favicon, gambar OG), Identitas dan kontak (nama badan usaha, alamat, email), Pengumuman (bar atas), dan Dokumentasi (Base URL API publik, contoh Model ID).
  - Setiap penyimpanan meminta kode 2FA atau passkey dan menulis baris `site.*` di audit.
  - Gambar: hanya PNG, JPEG, WebP (favicon juga ICO), diperiksa dari isi file. SVG ditolak. Disajikan lewat `/brand/logo`, `/brand/favicon`, `/brand/og` dengan ETag.
  - Nama brand, logo, favicon, footer, 404, halaman auth, email, bar pengumuman, dan tiga placeholder legal (badan usaha, alamat, email kontak) membaca dari pengaturan ini.
  - Tetap statis: issuer TOTP dan nama passkey "Aedoxy", teks tombol "Aedoxy" di login console.
- **Dokumentasi** di `/docs` (dari `obersai-docs`), menggantikan halaman "segera hadir". Hero, form konfigurasi cepat (Base URL, API key, Model ID), penjelasan Base URL OpenAI dan Anthropic, integrasi Claude Code, Codex CLI, OpenCode, Cursor, 9Router, SDK, cURL, dan troubleshooting termasuk 403 dan 429. Bahasa Indonesia dan Inggris. Merek dan Base URL diambil dari pengaturan situs.
- Rute `[stub]` dihapus. URL satu segmen yang tidak dikenal tetap 404.
- Migrasi baru `0005` (tabel `site_settings` dan `site_assets`).

### Gelombang 5 sampai 7 (sudah dilaporkan sebelumnya, ulangi cek singkat)
- Cangkang console bertemplate, menu per peran, dan `proxy.ts` yang memeriksa sesi dan peran untuk `/admin/*`.
- Satu paket aktif, batas satu order tertunda, tombol batalkan pembayaran, dialog konfirmasi beli, tab periode di `/plans`.
- TanStack Table, halaman 404 bergaya, skeleton.
- Sesi 24 jam, "percayai perangkat 30 hari", pengalihan dari `/login` bila sudah masuk, tombol landing "Dashboard". Migrasi `0003`.
- Console New API (fork Go): pembatas `refresh` dan `logout` terpisah dari login, kartu "Plan credit".
- Admin: urutan paket tidak membuat paket belum sinkron, sinkron paket menerima `data:null`, "Grup setelah beli" berupa pilihan dari console, `/admin/promos/new`, passkey dan pengelolaan 2FA, reset 2FA lewat CLI.

### Yang tidak diubah
Alur pembayaran Poketo, skema harga, kurs, dan guard server action.

## B. Skenario uji

Prasyarat lokal: Postgres dev jalan, `bun run build` lalu jalankan web (`:3000`), console (`:3100`), dan `bun run worker`. Tunnel `cloudflared tunnel run aedoxy-dev` hanya perlu untuk B6. Gunakan jendela privat untuk akun user biasa.

### B0. Gerbang otomatis (jalankan dulu)
- [ ] `bun run typecheck` tanpa error (menjalankan `next typegen` dulu agar tipe global `PageProps` ada).
- [ ] `bunx eslint src scripts` tanpa error.
- [ ] Dengan `DATABASE_URL_TEST` terisi (`postgres://aedoxy:aedoxy_dev@127.0.0.1:54320/aedoxy_test`), `bun run test` lulus semua. Tanpa variabel itu 249 tes integrasi gagal. Itu bukan bug.
- [ ] `bun run build` berhasil.
- [ ] Di `gateway-aedoxy`: `go test ./middleware` lulus.

### B1. Dokumentasi `/docs`
- [ ] Buka `/docs` tanpa login. Halaman tampil, judul tab "Dokumentasi | <nama brand>".
- [ ] Tidak ada kata "obersa" atau `ai.obersa.my.id` di halaman.
- [ ] Isi Model ID di form konfigurasi. Nilai muncul di semua contoh kode.
- [ ] Tombol "Salin" mengubah label menjadi "Disalin" sebentar. Tempel hasilnya di editor dan cek isinya benar.
- [ ] Ganti ke EN. Seluruh teks berganti, nilai form tetap. Reload: pilihan EN tetap.
- [ ] Sidebar kiri menyorot bagian yang sedang dilihat. Klik "Troubleshooting" menggulir ke bagiannya.
- [ ] Lebar 390 piksel: tidak ada scroll horizontal, navigasi bagian ada di bawah, blok kode bisa digulir ke samping.
- [ ] Mode gelap terbaca (kontras teks dan blok kode).
- [ ] Salin konfigurasi Claude Code ke mesin Anda dan coba satu permintaan ke console lokal (opsional, perlu API key).

### B2. Pengaturan situs `/admin/settings`
- [ ] Sebagai user biasa, `/admin/settings` menjawab 404 tanpa label menu admin.
- [ ] Sebagai admin penuh, menu "Pengaturan situs" ada di grup Sistem.
- [ ] Ubah nama brand tanpa mengisi kode 2FA: ditolak dan data tidak berubah.
- [ ] Ubah nama brand dengan kode 2FA benar: tersimpan. Dalam kira-kira 30 detik, navbar, footer, judul tab, `/login`, dan `/docs` memakai nama baru. Baris `site.brand` ada di `/admin/audit`.
- [ ] Unggah logo PNG: tampil di navbar terang dan gelap. Unggah file `.svg`: ditolak. Ganti ekstensi file teks menjadi `.png` lalu unggah: ditolak.
- [ ] Unggah file lebih dari 2 MB: muncul pesan yang jelas, bukan layar error.
- [ ] Favicon: tab browser berubah setelah hard refresh. `/brand/favicon` mengembalikan gambar dan `/brand/logo` menjawab 304 pada permintaan kedua (header `If-None-Match`).
- [ ] Isi nama badan usaha, alamat, email kontak: tiga placeholder di `/terms`, `/privacy`, `/refund` terisi. Sisa placeholder `[ISI: ...]` yang belum ada sumbernya tetap tampil.
- [ ] Isi pengumuman dengan tautan: bar tampil di halaman publik dan bisa ditutup. Kosongkan: bar hilang.
- [ ] Ubah Base URL API dan contoh Model ID: `/docs` ikut berubah.
- [ ] Setel ulang logo ke bawaan: logo kembali ke bawaan.
- [ ] Kembalikan semua nilai ke bawaan sebelum deploy, atau isi dengan nilai produksi yang benar.

### B3. Keamanan dan akses
- [ ] Anonim ke `/admin`, `/admin/settings`: dialihkan ke `/login`.
- [ ] User biasa ke `/admin/*`: 404 sungguhan (cek tab Network, status 404, tanpa menu admin di HTML).
- [ ] Admin tanpa 2FA: hanya melihat "Keamanan" dan dialihkan ke `/admin/security`.
- [ ] Sudah masuk lalu buka `/login`: dialihkan ke `/dashboard`.
- [ ] `/login?callbackURL=//evil.example` setelah masuk jatuh ke `/dashboard`.
- [ ] Setelah login, buka `/api/orders` dengan akun lain: hanya order milik sendiri yang terlihat.

### B4. Pembelian dan paket (regresi)
- [ ] `/plans`: tab Semua, Mingguan, Bulanan menyaring, Harian menampilkan pesan kosong.
- [ ] Klik "Beli": muncul dialog, belum ada order sampai "Lanjut ke pembayaran".
- [ ] Dengan promo `UJI10`: jumlah bayar turun 10 persen.
- [ ] Order tertunda kedua ditolak dengan tautan ke yang pertama.
- [ ] "Batalkan pembayaran" membatalkan order dan invoice Poketo.
- [ ] Bayar lewat sandbox Poketo: order `succeeded`, paket aktif di dashboard, "Plan credit" terisi di console.
- [ ] Beli paket lain: paket lama berlabel "Digantikan", hanya satu "Paket aktif".

### B5. Console dan login lintas domain
- [ ] Dari `/dashboard`, "Buka Console" masuk tanpa meminta login ulang.
- [ ] Keluar dari console lalu masuk lagi lewat tombol "Aedoxy" lima kali berturut-turut: tidak ada "429".
- [ ] Buat API key di console, lalu pakai di `/docs` contoh cURL: respons 200 bila kredit ada.

### B6. Webhook Poketo asli (hanya lewat tunnel)
- [ ] Jalankan tunnel, buat pembayaran sandbox sungguhan, dan pastikan webhook masuk dan order terpenuhi tanpa skrip simulasi.

### B7. Akun admin dan pemulihan
- [ ] Daftarkan passkey di perangkat nyata, keluar, lalu masuk dengan passkey.
- [ ] Simpan 10 kode cadangan 2FA di tempat aman. Uji satu kode.
- [ ] Hapus akun uji `adm7*`, `e2e.*`, `trust.*`, `ui.*`, promo uji, dan order sandbox dari DB dev bila DB dev akan dipakai ulang. Untuk produksi mulai dari DB kosong.

## C. Sebelum push dan deploy

### Sebelum push
- [ ] `git status` bersih di `aedoxy-web` dan `gateway-aedoxy` (folder `logs/` tidak dilacak, jangan di-commit).
- [ ] Tidak ada rahasia di diff: `git diff origin/<branch>...HEAD | Select-String 'TOKEN|SECRET|PASSWORD'` hanya menampilkan nama variabel.
- [ ] Remote dan nama branch sudah diputuskan. Push ke branch fitur, buka PR, jangan ke `main`.

### Sebelum deploy
- [ ] Ganti password default `123456` di `gateway-aedoxy/docker-compose.yml`.
- [ ] `Caddyfile` masih memuat `ai.obersa.my.id`. Ganti ke domain Aedoxy.
- [ ] Env produksi terisi, dengan `ENV_STRICT=true` dan tanpa `EMAIL_DEV_OUTBOX`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `NEWAPI_PUBLIC_URL`, `NEWAPI_INTERNAL_URL`, `NEWAPI_BRIDGE_TOKEN`, `EMAIL_FROM`, `EMAIL_SMTP_HOST` (atau `EMAIL_SERVER_URL`), kredensial Poketo.
- [ ] Token bridge `aedoxy-bridge` dibuat dengan lima scope: `user:read`, `user:write`, `billing:read`, `billing:write`, `group:read`.
- [ ] `ServerAddress` di New API sama persis dengan `NEWAPI_PUBLIC_URL`. Jalankan `bun run db:seed-oauth` setelah itu.
- [ ] Penyedia email dipilih dan email verifikasi terkirim ke kotak masuk nyata.
- [ ] Uji SMTP: `sudo docker compose run --rm migrate node scripts/send-test-email.js alamat@contoh.com` mencetak `terkirim` (kode keluar 0) dan email uji tiba di inbox. Bila gagal, kodenya (mis. `EAUTH 535`) menunjuk penyebab; lihat `deploy/README.md` bagian Email.
- [ ] Dengan `EMAIL_SMTP_*` (atau `EMAIL_SERVER_URL`) Mailtrap terisi: daftar akun baru, email verifikasi muncul di inbox Mailtrap, dan tautannya membuka akun terverifikasi. Mailtrap Sandbox hanya menangkap email; pengiriman ke penerima nyata butuh Mailtrap Sending.
- [ ] Webhook Poketo mengarah ke URL produksi dan rahasia tanda tangannya terisi.
- [ ] Backup DB sebelum migrasi: `pg_dump`. Jalankan `bun run db:migrate` (0001 sampai 0005) lalu `bun run db:seed-catalog`.
- [ ] Worker dijalankan sebagai proses terpisah dan tetap hidup (`bun run worker`).
- [ ] Jadikan akun Anda admin: `bun run db:make-admin <email>`, daftarkan 2FA dan passkey sebelum membuka ke publik.
- [ ] Isi 19 placeholder `[ISI: ...]` di halaman legal (sebagian lewat `/admin/settings`, sisanya keputusan bisnis: jendela refund, chargeback, penyimpanan prompt).
- [ ] Isi pengaturan situs produksi: nama brand, logo, favicon, gambar OG, Base URL API, kontak.
- [ ] Pembatas laju percobaan 2FA dan trust device ada di memori proses, jadi jalankan satu instance web saja, atau pindahkan ke penyimpanan bersama dulu.

### Setelah deploy (smoke test)
- [ ] `/`, `/docs`, `/pricing`, `/models` menjawab 200 dengan HTTPS.
- [ ] Daftar akun baru, verifikasi email, beli paket kecil sungguhan, dan pastikan paket aktif di console.
- [ ] Kirim satu permintaan API dengan key yang baru dibuat dan cek kredit berkurang.
- [ ] Cek `/admin/audit`, `/admin/pool`, dan `/admin/fx` (kurs terisi dari Frankfurter).

### Rollback
- Aplikasi: deploy ulang commit sebelumnya. Migrasi 0003 dan 0005 hanya menambah kolom dan tabel, jadi kode lama tetap jalan di atas skema baru.
- Data: pulihkan dari `pg_dump` sebelum migrasi hanya bila ada kerusakan data. Itu menghapus order setelah backup.
