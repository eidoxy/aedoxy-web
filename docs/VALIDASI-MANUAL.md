# Validasi manual dan skenario uji sebelum push dan deploy

Dokumen ini untuk Anda centang sendiri. Bagian A merangkum perubahan gelombang 5 sampai 8. Bagian B adalah skenario uji berurutan. Bagian C adalah daftar periksa deploy.

Tandai tiap kotak dengan `[x]` bila lulus. Bila ada yang gagal, catat langkah dan hasil yang terlihat.

## A. Ringkasan perubahan

### Gelombang 8 (terbaru)
- **Pengaturan situs** di `/admin/settings` (grup Sistem). Lima bagian: Brand (nama, tagline, deskripsi), Logo dan ikon (logo, favicon, gambar OG), Identitas dan kontak (nama badan usaha, alamat, email), Pengumuman (bar atas), dan Dokumentasi (Base URL API publik, contoh Model ID).
  - Setiap penyimpanan tidak meminta kode 2FA dan menulis baris `site.*` di audit.
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
- [ ] Form tidak punya kolom "Kode 2FA" atau tombol "Gunakan passkey".
- [ ] Ubah nama brand: tersimpan tanpa kode. Dalam kira-kira 30 detik, navbar, footer, judul tab, `/login`, dan `/docs` memakai nama baru. Baris `site.brand` ada di `/admin/audit`.
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

### B3a. Kode 2FA hanya untuk kredensial
- [ ] Ubah harga paket, simpan promo, tambah/kurangi stok pool, coba lagi fulfillment: tidak ada kolom kode 2FA, dan aksi langsung tersimpan. Dialog "Hentikan promo" dan "Nonaktifkan paket" tetap meminta konfirmasi tanpa kode.
- [ ] Di `/admin/security`, buat ulang kode cadangan, tambah passkey, dan atur ulang 2FA tetap meminta kode 2FA (atau passkey).

### B3b. Pengguna `/admin/users`
- [ ] Menu "Pengguna" ada di grup Sistem, sebelum "Audit log". Admin tanpa 2FA hanya melihat "Keamanan".
- [ ] Cari dengan username, email, dan nama. Ketik `%` atau `_` di kolom cari: dianggap teks biasa. Filter peran, status, email terverifikasi, dan console bekerja; halaman kedua muncul bila lebih dari 25 pengguna.
- [ ] Tabel muat di layar 390 px tanpa halaman bergeser ke samping (tabel menggulir di dalam kartu).
- [ ] Detail pengguna: metode login hanya berupa nama (password, google, github), tanpa token atau hash. Id ngawur menampilkan 404.
- [ ] Blokir pengguna uji dengan alasan: sesinya keluar, halaman masuk menampilkan alasan, status console menjadi "Dinonaktifkan di console", baris `user.ban` ada di audit dengan nama admin. Buka blokir mengembalikan semuanya.
- [ ] Blokir admin lain yang juga admin di console: halaman melaporkan console menolak (409); blokir di web tetap berlaku.
- [ ] Di akun sendiri: tombol blokir dan ubah peran tidak ada. Menurunkan admin terakhir ditolak.
- [ ] "Keluarkan dari semua perangkat": perangkat pengguna uji harus masuk lagi.

### B3d. Kelola akun pengguna (gelombang 9h)
Migrasi `0009` harus sudah berjalan. Pakai pengguna uji (bukan akun admin), dan cek tampilan di 390 px: dialog tidak meluber, fokus pindah ke dialog saat dibuka dan kembali ke tombol saat ditutup, tiap kolom punya label.
- [ ] Kartu "Kelola akun" menampilkan kata sandi (Ada/Belum ada), passkey (jumlah), dan 2FA. Di akun sendiri kartu hanya menunjuk ke Keamanan. "Reset 2FA" mati bila pengguna tanpa 2FA, "Reset passkey" mati bila tanpa passkey.
- [ ] Ubah nama tampilan: 1 karakter dan 81 karakter ditolak, nama valid tersimpan. Tidak ada kode 2FA, tidak ada email. Nama di console tidak ikut berubah.
- [ ] Atur kata sandi: tanpa kode 2FA ditolak, kode salah ditolak, kode benar berhasil. "Buat acak" mengisi 20 karakter yang terlihat dan bisa disalin; ketik manual tetap tersamar. Pengguna uji masuk dengan username DAN email memakai kata sandi baru, kata sandi lama gagal, sesi lamanya keluar. Pengguna uji menerima email pemberitahuan tanpa kata sandi dan tanpa tautan. Baris `user.password.set` ada di audit tanpa kata sandi.
- [ ] Atur kata sandi untuk pengguna yang hanya login Google/GitHub: dialog memperingatkan, setelahnya login dengan email dan kata sandi itu berhasil.
- [ ] Atur kata sandi lewat tombol "Gunakan passkey" (tanpa mengetik kode) berhasil sekali; percobaan kedua meminta bukti baru.
- [ ] Reset 2FA: pengguna uji yang punya 2FA kehilangan 2FA-nya, sesinya keluar, email pemberitahuan terkirim, `user.2fa.reset` ada di audit dengan nama admin. Reset passkey: semua passkey hilang, `user.passkeys.reset` mencatat jumlahnya.
- [ ] Hapus akun: dialog menyebut bahwa akun console dinonaktifkan dan catatannya dapat dihapus manual oleh admin console, dan memperingatkan bila ada paket aktif. Ketik username salah ditolak. Pengguna dengan pesanan belum dibayar ditolak dengan pesan jelas. Akun admin ditolak. Setelah berhasil: detail pengguna menampilkan banner "dihapus" dan tanpa tombol aksi; daftar tidak lagi memuatnya kecuali filter Status "Terhapus"; akun console-nya "Dinonaktifkan di console" (cek di console gateway; bila bridge gagal, tunggu satu menit untuk worker).
- [ ] Setelah dihapus, email dan username yang sama bisa mendaftar lagi; pesanan lama pengguna tetap terlihat di `/admin/orders` dan saldo pool tidak berubah.
- [ ] Lebih dari 10 aksi kelola dalam satu menit: aksi ke-11 ditolak dengan "Terlalu banyak aksi".

### B3e. Metadata model dan katalog `/models` (gelombang 9i)
- [ ] `/admin/models`: "Hapus" di baris metadata membuka dialog yang menyebut nama model, bahwa hanya metadata yang dihapus, modelnya tetap tampil di /models tanpa metadata, dan tindakan tidak dapat dibatalkan. Esc menutup dialog, fokus kembali ke tombol. Tidak ada kode 2FA.
- [ ] Setelah hapus: baris hilang, pesan "Metadata model dihapus." tampil di atas tabel, model muncul di "Model tanpa metadata", `/models` memperbarui seketika, dan `model_meta.delete` ada di audit dengan data lama (`before`). Bila baris itu sedang terbuka di form (`?edit=`), form kembali kosong. Simpan ulang nama yang sama membuat baris baru (`model_meta.create`).
- [ ] `/models` di 390 px dan 768 px: tiap model tampil sebagai kartu dengan biaya kredit, harga resmi, context, kemampuan, status, dan output per paket tanpa menggeser ke samping; tombol salin berfungsi. Di 1280 px ke atas tampil tabel seperti sebelumnya. Cek terang dan gelap.
- [ ] Model berekspresi (`tiered_expr`): "Biaya kredit / 1M" terisi dari `GET /api/aedoxy/model-prices` gateway (harga dasar x rasio grup `default`, tanpa mem-parse ekspresi di web). Bila `dynamic: true`, ada catatan kecil "harga saat ini" di tabel dan kartu. Pada gateway lama (route 404) katalog tetap tampil, model berekspresi menampilkan "-", dan log memuat `[catalog] expression prices unavailable (HTTP 404): upgrade gateway`. Katalog di-cache 10 menit, jadi perubahan harga gateway muncul paling lambat sekitar 10 menit kemudian.

### B3c. Batas laju bersama dan IP klien (gelombang 9d)
Jalankan di produksi atau lewat tunnel, karena `cf-connecting-ip` hanya ada di belakang Cloudflare. Migrasi `0008` harus sudah berjalan.
- [ ] Salah kata sandi 6 kali berturut-turut di `/login` (email sama, jendela satu menit): percobaan ke-6 mendapat HTTP 429 (cek tab Network atau `curl -i -X POST https://aedoxy.com/api/auth/sign-in/email ...`).
- [ ] Restart web (`sudo docker compose restart web`) tepat setelah 5 percobaan gagal: percobaan berikutnya dalam menit yang sama tetap 429, karena penghitung ada di tabel `rate_limit`, bukan di memori.
- [ ] `sudo docker compose exec postgres psql -U <user> -d aedoxy -c "select key, count from rate_limit order by last_request desc limit 5"` menampilkan kunci berbentuk `<IP publik>|/sign-in/email`.
- [ ] `sudo docker compose logs web --tail=50` dan kolom `ip_address` di tabel `session` serta `admin_audit_log.ip` menunjukkan IP publik Anda, bukan `172.28.x.x`.
- [ ] Kirim `curl -H "x-forwarded-for: 1.2.3.4" https://aedoxy.com/api/public/activity` lebih dari 30 kali per menit: tetap mendapat 429 walau `x-forwarded-for` diganti-ganti, dan baris `rate_limits` berkunci `public:activity:<IP Anda>` bertambah.
- [ ] Login konsol (B5) tetap tidak kena 429; kunci `<IP VPS>|/oauth2/token` di tabel `rate_limit` boleh naik sampai 600 per menit.
- [ ] Setelah satu jam worker berjalan, log tidak menampilkan `task rate-limit-cleanup failed`, dan baris `rate_limits`/`rate_limit` yang lebih tua dari satu jam hilang.

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
- [ ] Daftar user baru dengan username yang sudah dipakai user console lama (jalankan worker): akun console-nya mendapat nama acak, dan login/Buka Console tetap berjalan.
- [ ] Ban di aedoxy.com (`bun run db:ban-user <email> alasan`, atau di produksi `scripts/ban-user.js` lewat compose): sesi web berakhir, sesi console tertutup, dan API key user ditolak. Skrip mencetak `console: dinonaktifkan`.
- [ ] Hentikan console, jalankan ban lagi: skrip mencetak `console: tertunda, worker akan mengulang`. Nyalakan console, tunggu sekitar 1 menit: worker menonaktifkannya dan log `sync-console-status` tidak lagi melapor gagal.
- [ ] Unban (`bun run db:unban-user <email>`): user bisa masuk dan membuat API key lagi di console, dan API key lama berfungsi kembali.
- [ ] Ban user yang berperan Admin di console: aedoxy mencatat ban, console menolak (409), dan log worker menampilkan `protected:http:409`. Akun console-nya tetap aktif.
- [ ] User terverifikasi tanpa akun console (kosongkan `newapi_user_id` di DB dev, console boleh dimatikan sementara saat verifikasi): setelah console hidup, worker `link-console-accounts` menautkannya dalam sekitar 2 menit tanpa menekan "Buka Console".

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
- [ ] Backup DB sebelum migrasi: `pg_dump`. Jalankan `bun run db:migrate` (0001 sampai 0008) lalu `bun run db:seed-catalog`.
- [ ] Worker dijalankan sebagai proses terpisah dan tetap hidup (`bun run worker`).
- [ ] Jadikan akun Anda admin: `bun run db:make-admin <email>`, daftarkan 2FA dan passkey sebelum membuka ke publik.
- [ ] Isi 19 placeholder `[ISI: ...]` di halaman legal (sebagian lewat `/admin/settings`, sisanya keputusan bisnis: jendela refund, chargeback, penyimpanan prompt).
- [ ] Isi pengaturan situs produksi: nama brand, logo, favicon, gambar OG, Base URL API, kontak.
- [ ] Pembatas laju kini di Postgres (tabel `rate_limits` dan `rate_limit`, migrasi `0008`), jadi lebih dari satu instance web aman. Tidak ada variabel env baru. Jalankan `migrate` sebelum `up -d web worker`.

### Setelah deploy (smoke test)
- [ ] `/`, `/docs`, `/pricing`, `/models` menjawab 200 dengan HTTPS.
- [ ] Daftar akun baru, verifikasi email, beli paket kecil sungguhan, dan pastikan paket aktif di console.
- [ ] Kirim satu permintaan API dengan key yang baru dibuat dan cek kredit berkurang.
- [ ] Cek `/admin/audit`, `/admin/pool`, dan `/admin/fx` (kurs terisi dari Frankfurter).

### Rollback
- Aplikasi: deploy ulang commit sebelumnya. Migrasi 0003 dan 0005 hanya menambah kolom dan tabel, jadi kode lama tetap jalan di atas skema baru.
- Data: pulihkan dari `pg_dump` sebelum migrasi hanya bila ada kerusakan data. Itu menghapus order setelah backup.
