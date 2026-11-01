# PRD: Aedoxy, Platform Langganan Kredit API

| | |
|---|---|
| Versi | 0.2 (draf untuk ditinjau) |
| Tanggal | 2026-11-01 |
| Pemilik | Adrian |
| Dokumen terkait | `TRD.md`, `features/F00`–`F08`, `AI-SKILLS.md` |
| Perubahan dari 0.1 | Pembayaran sepenuhnya lewat langganan berharga flat (tanpa top up per dolar). Kurs hanya untuk tampilan. Penentuan harga ditunda |

## 1. Ringkasan

Aedoxy menjual akses API model AI dalam bentuk **paket langganan berharga flat**. Contohnya "$10 kredit / bulan seharga Rp40.000". Kredit setiap paket diambil dari **pool global** yang diisi admin. Saat masa aktif paket berakhir, sisa kreditnya hangus.

Sistemnya terdiri dari dua aplikasi:

- **ai.aedoxy.com**: console API (fork New API `gateway-aedoxy`). Di sini user membuat API key, melihat log, dan kredit dipotong saat API dipakai.
- **aedoxy.com**: aplikasi Next.js baru. Isinya landing page, panel user untuk membeli dan memantau paket, serta dashboard admin untuk mengatur pool, paket, diskon, dan kurs tampilan.

User cukup punya satu akun, yang berlaku di kedua aplikasi.

## 2. Masalah

1. Provider pembayaran bawaan New API tidak cocok untuk pembeli Indonesia, yang umumnya membayar dengan QRIS.
2. Kredit yang dijual tidak dibatasi stok, sehingga bisa melebihi kredit upstream yang sudah dibeli.
3. Paket dan harga perlu diubah admin kapan saja tanpa developer.
4. Pembeli perlu melihat nilai kredit dalam rupiah agar mudah dipahami.
5. Calon pembeli belum melihat bukti bahwa layanan ini dipakai orang lain.

## 3. Tujuan

| ID | Tujuan | Ukuran |
|---|---|---|
| G1 | Pembeli membeli paket dengan QRIS, dan paket aktif di console secara otomatis | p95 waktu dari "lunas" sampai paket aktif < 60 detik |
| G2 | Total kredit paket yang terjual tidak melebihi pool global | Pool tersedia ≥ 0, kecuali pembayaran terlambat yang tercatat di ledger |
| G3 | Admin mengatur paket, harga, diskon, pool, dan kurs tampilan tanpa deploy | Semua pengaturan ada di dashboard admin |
| G4 | Satu akun untuk aedoxy.com dan ai.aedoxy.com | User tidak mendaftar dua kali |
| G5 | Setiap pembayaran menghasilkan tepat satu paket aktif | 0 paket ganda, 0 pembayaran tanpa paket setelah rekonsiliasi |

## 4. Bukan tujuan versi 1

- **Top up per dolar (pay as you go).** User tidak bisa membeli kredit dengan nominal bebas. Saldo dompet di console tidak dipakai.
- **Menentukan atau menghitung harga paket.** Harga diisi admin. Cara menentukan harga dibahas setelah sistem selesai.
- Refund otomatis. Refund dan chargeback ditangani admin secara manual dengan bantuan sistem.
- Pembayaran selain Poketo, dan mata uang selain IDR.
- Program afiliasi atau referral, aplikasi mobile, dan UI chat.
- Mengganti console New API. API key, log, dan playground tetap di ai.aedoxy.com.

## 5. Pengguna

| Persona | Kebutuhan utama |
|---|---|
| **Pembeli** (developer, pengguna coding agent seperti Claude Code, Cursor, OpenCode) | Paket jelas, harga flat dalam rupiah, bayar cepat dengan QRIS, kredit langsung bisa dipakai |
| **Pengunjung** (belum punya akun) | Melihat model, paket, dan cara pakai sebelum mendaftar |
| **Admin** (pemilik layanan) | Mengatur stok kredit, paket, harga, dan diskon. Melihat pendapatan dan menangani order bermasalah |

## 6. Fitur dan prioritas

P0 = wajib untuk rilis pertama. P1 = rilis kedua. P2 = setelahnya.

| ID | Fitur | Prioritas | Dokumen planning |
|---|---|---|---|
| F00 | Fondasi: akun tunggal (SSO), integrasi console, deployment | P0 | `features/F00-fondasi-akun-dan-integrasi.md` |
| F01 | Pembayaran paket dengan Poketo (QRIS) | P0 | `features/F01-pembayaran-poketo.md` |
| F02 | Pool kredit global | P0 | `features/F02-pool-global.md` |
| F03 | Subscription berjangka (mingguan, bulanan, kredit hangus) | P0 | `features/F03-subscription-berjangka.md` |
| F05 | Pengelolaan paket dan harga flat oleh admin | P0 | `features/F05-admin-paket.md` |
| F04 | Kurs USD → IDR untuk tampilan | P1 | `features/F04-kurs-usd.md` |
| F08 | Landing page dan katalog model | P1 | `features/F08-landing-dan-katalog.md` |
| F06 | Promo dan diskon tambahan (kode promo, paket promo) | P2 | `features/F06-promo-dan-diskon.md` |
| F07 | Feed aktivitas pembelian | P2 | `features/F07-aktivitas-topup.md` |

F03 dan F05 masuk P0 karena paket adalah satu-satunya produk yang dijual. Kurs turun ke P1 karena hanya dipakai untuk tampilan.

## 7. Kebutuhan per fitur

### F00 Akun tunggal dan integrasi console

- Sebagai pengunjung, saya bisa mendaftar di aedoxy.com dengan email dan password atau dengan Google.
- Sebagai pembeli, saya bisa menekan "Buka Console" lalu masuk ke ai.aedoxy.com tanpa login ulang.
- Sebagai pembeli, paket yang saya beli di aedoxy.com aktif di console ai.aedoxy.com.

Kriteria terima:
- Satu akun aedoxy.com terhubung ke tepat satu user New API.
- Login ke console hanya melalui akun Aedoxy. Pendaftaran password di console dimatikan.
- Pembeli yang membeli paket sebelum pernah membuka console tetap menerima paketnya.

### F01 Pembayaran paket (Poketo)

- Sebagai pembeli, saya memilih paket, melihat harga flat (dan diskon bila ada), lalu membayar dengan QRIS atau metode lain yang diaktifkan di Poketo.
- Sebagai pembeli, saya kembali ke halaman status order dan melihat paket saya aktif.
- Sebagai pembeli, saya melihat riwayat order dan statusnya.

Kriteria terima:
- Nominal yang dibayar = harga flat paket, dikurangi diskon. Nominal ini tidak dihitung dari kurs.
- Batas nominal Rp10.000 sampai Rp10.000.000 per transaksi QRIS (aturan Poketo dan Bank Indonesia).
- Halaman checkout menjelaskan bahwa biaya pembayaran Poketo dibayar pembeli, dan menampilkan perkiraan totalnya.
- Order yang tidak dibayar kedaluwarsa dalam 15 menit (bisa diatur), dan stok kreditnya kembali ke pool.
- Bila user masih punya paket aktif, checkout menampilkan peringatan: paket lama berakhir saat paket baru aktif, dan sisa kreditnya hangus. User harus mencentang konfirmasi sebelum membayar.

### F02 Pool kredit global

- Sebagai admin, saya menambah atau mengurangi stok pool (misalnya $1.000) dan memberi catatan untuk setiap perubahan.
- Sebagai admin, saya melihat total, direservasi, terjual, dan tersedia, beserta riwayat (ledger).
- Sebagai pembeli, saya tidak bisa membeli paket jika stok pool kurang dari kredit paket. Pesan error-nya jelas.

Kriteria terima:
- Setiap order paket mereservasi kredit paket dari pool saat dibuat. Reservasi berpindah ke "terjual" saat lunas, dan dilepas saat order kedaluwarsa atau gagal.
- Sisa kredit paket yang hangus dikembalikan ke pool.
- Sistem memberi peringatan admin bila stok tersedia di bawah ambang yang diatur.
- Pembeli tidak bisa menahan stok berlebihan. Order pending per user dibatasi (default 3).

### F03 Subscription berjangka

- Sebagai pembeli, saya membeli paket seperti "Mingguan $7 seharga Rp25.000". Kreditnya bisa dipakai selama masa aktif, lalu sisanya hangus.
- Sebagai pembeli, saya melihat sisa kredit paket dan sisa waktunya di panel dan di console.

Kriteria terima:
- Durasi didukung dalam jam dan hari. Mingguan = 7 hari, bulanan = 30 hari (bukan bulan kalender).
- Pemakaian API hanya memotong kredit paket. Jika tidak ada paket aktif, atau kredit paket habis, request ditolak dengan pesan "kredit habis".
- Setelah masa aktif berakhir, kredit paket tidak bisa dipakai lagi.

### F04 Kurs USD untuk tampilan

- Sebagai pembeli, saya melihat nilai kredit dalam rupiah sebagai keterangan, misalnya "$10 ≈ Rp181.480".
- Sebagai admin, saya memilih kurs tampilan **manual** (angka tetap) atau **otomatis** (mengikuti kurs pasar, diperbarui berkala).

Kriteria terima:
- Kurs tidak pernah dipakai untuk menghitung nominal yang dibayar.
- Konversi selalu diberi tanda "≈" dan sumber atau waktu pembaruannya.
- Bila sumber kurs gagal atau datanya lebih tua dari 72 jam, sistem memakai kurs terakhir dan memberi peringatan admin.

### F05 Pengelolaan paket dan harga flat

- Sebagai admin, saya membuat, mengubah, menonaktifkan, dan mengurutkan paket: nama, periode (mingguan, bulanan, atau durasi kustom), kredit $, harga flat Rp, diskon, batas pembelian, stok paket, dan badge.
- Sebagai admin, saya bisa memberi diskon langsung pada paket (harga coret), kapan saja.
- Perubahan paket berlaku untuk pembelian berikutnya. Paket yang sudah dibeli tidak berubah.

Contoh susunan paket (hanya contoh, bukan harga final):

| Periode | Kredit | Harga |
|---|---|---|
| Mingguan | $5 | Rp20.000 |
| Mingguan | $7 | Rp25.000 |
| Mingguan | $11 | Rp35.000 |
| Bulanan | $10 | Rp40.000 |
| Bulanan | $20 | Rp55.000 |
| Bulanan | $40 | Rp100.000 |

### F06 Promo dan diskon tambahan

- Sebagai admin, saya membuat kode promo atau diskon berperiode (persen atau nominal) untuk semua paket atau paket tertentu.
- Sebagai admin, saya membuat paket promo seperti "Unlimited 24 jam, Rp50.000" dengan batas fair use dan stok terbatas.
- Sebagai pembeli, saya memasukkan kode promo dan melihat potongan sebelum membayar.

Kriteria terima:
- Promo punya periode, kuota pemakaian total, dan batas per user. Kuota tidak terlampaui walaupun ada banyak order bersamaan.
- Harga akhir minimal Rp10.000.
- Paket "unlimited" selalu punya batas fair use yang tertulis di halaman paket dan di syarat layanan.

### F07 Feed aktivitas pembelian

- Sebagai pengunjung, saya melihat pembelian terbaru, misalnya "A•••n membeli Bulanan $20 · 2 jam lalu".
- Sebagai pembeli, saya bisa menyembunyikan aktivitas saya dari feed.

Kriteria terima:
- Data berasal dari order yang benar-benar lunas. Tidak ada data rekaan.
- Nama selalu disamarkan, dan email tidak pernah ditampilkan.
- Komponen bisa dijeda dan mengikuti pengaturan `prefers-reduced-motion`.

### F08 Landing page dan katalog model

- Sebagai pengunjung, saya melihat penjelasan layanan, contoh kode, daftar model per provider, paket, dan cara mulai.
- Struktur halaman mengikuti referensi gutsai.id: hero dengan contoh kode, keunggulan, kompatibilitas coding agent, katalog model, paket, langkah memulai, dan FAQ.

## 8. Peta halaman

| Area | Halaman |
|---|---|
| Publik | `/` landing, `/models` katalog, `/pricing` paket, `/docs` cara pakai, `/terms`, `/privacy`, `/refund` |
| Akun | `/login`, `/register`, `/verify-email`, `/forgot-password` |
| Panel user | `/dashboard` paket aktif, sisa kredit, dan masa aktif; `/plans` pilih dan beli paket; `/orders`; `/orders/[id]`; `/settings` (profil, privasi feed, keamanan) |
| Admin | `/admin` ringkasan, `/admin/pool`, `/admin/orders`, `/admin/plans`, `/admin/promos`, `/admin/fx`, `/admin/users`, `/admin/activity`, `/admin/audit` |
| Console (New API) | ai.aedoxy.com: API key, log, playground. Tombol top up di console diarahkan ke aedoxy.com/plans |

## 9. Kebutuhan non-fungsional

| Area | Kebutuhan |
|---|---|
| Keandalan pembayaran | Webhook idempoten. Paket dikirim lewat outbox dengan retry, dan rekonsiliasi berkala dengan Poketo |
| Keamanan | Admin wajib 2FA. Secret hanya di environment variable. Tanda tangan webhook diverifikasi. Endpoint integrasi console tidak terbuka ke internet. Ada audit log untuk aksi admin |
| Privasi | Feed aktivitas memakai nama samaran dan menyediakan opt-out. Kebijakan privasi menjelaskan data yang ditampilkan. Data diminimalkan sesuai UU PDP (UU 27/2022) |
| Aksesibilitas | Target WCAG 2.2 AA. Konten bergerak bisa dijeda |
| Performa | Landing LCP < 2,5 detik di 4G. Halaman publik di-cache |
| Bahasa | Indonesia sebagai bahasa utama. Struktur siap untuk bahasa Inggris |
| Ketersediaan | Bila console atau Poketo sedang gangguan, order tetap tercatat dan paket diaktifkan setelah layanan pulih |

## 10. Metrik keberhasilan

- Konversi checkout → lunas, per paket.
- p95 waktu dari webhook lunas sampai paket aktif.
- Jumlah order yang butuh intervensi admin per minggu. Target: < 1% order.
- Selisih rekonsiliasi pool dan selisih rekonsiliasi Poketo terhadap order. Target: 0.
- Penjualan per paket, perpanjangan (pembelian ulang), dan rasio pemakaian kredit paket (kredit terpakai ÷ kredit dijual). Data ini dipakai saat diskusi harga nanti.

## 11. Keputusan bisnis (ditetapkan 2026-11-01)

Penentuan harga paket sengaja ditunda sampai sistem selesai.

1. **Paket "unlimited"** hanya contoh promo dan belum diterapkan. Bila nanti dipakai, wajib ada batas fair use (F06).
2. **Pembayaran setelah order kedaluwarsa** (Poketo tetap menandainya lunas): paket tetap diaktifkan walaupun pool menjadi negatif, lalu admin diberi peringatan.
3. **Hanya satu paket aktif per user.** Membeli paket baru saat paket lama masih aktif akan **menggantikan** paket lama. Sebelum membayar, user melihat peringatan bahwa paket lama berakhir saat paket baru aktif dan sisa kreditnya hangus. Sisa kredit itu kembali ke pool.
4. **Feed aktivitas** tampil dengan nama samaran secara default, dan user bisa opt-out.
5. **Tidak ada akun console lama.** Domain sebelumnya (`ai.obersa.my.id`) hanya diganti ke `ai.aedoxy.com` dan tidak punya user, jadi tidak perlu alur penautan akun.
6. **Stok pool ke publik**: publik hanya melihat status (tersedia / hampir habis / habis), bukan angka persisnya.

## 12. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Poketo menolak jenis usaha. [Kebijakan penggunaan](https://poketo.id/acceptable-use) melarang jual-beli akun dan kredensial | Tidak bisa menerima pembayaran | Daftarkan usaha sebagai layanan API AI berbasis langganan, lalu konfirmasi ke Poketo sebelum go-live |
| Ketentuan provider upstream melarang penjualan ulang | Akun upstream diblokir | Pakai kunci upstream resmi yang mengizinkan penggunaan ini |
| Penyalahgunaan paket unlimited (script, berbagi key) | Biaya upstream membengkak | Batas fair use, rate limit per grup, batas pembelian, stok paket |
| Pool dikunci oleh order palsu | Pembeli asli tidak bisa membeli | Batas order pending per user, verifikasi email, masa berlaku 15 menit, rate limit |
| Paket ganda saat retry | Kerugian | Endpoint fulfill idempoten berdasarkan `trade_no` (lihat TRD) |
| Pembeli mengira konversi rupiah adalah harga | Komplain | Konversi selalu bertanda "≈", diletakkan sebagai keterangan, dan harga flat ditampilkan paling menonjol |
| Password default `123456` di `gateway-aedoxy/docker-compose.yml` (Postgres, Redis) | Kebocoran data jika port terbuka | Ganti sebelum go-live dan simpan di `.env` server |

## 13. Rilis bertahap

| Rilis | Isi | Syarat selesai |
|---|---|---|
| R0 Fondasi | F00 | Login Aedoxy, SSO ke console, endpoint bridge, deploy staging |
| R1 MVP | F02, F03, F05, F01, panel user dasar, admin order | Paket dibeli di sandbox, aktif, dipakai, lalu hangus, dan sisanya kembali ke pool. Lalu satu transaksi live Rp10.000 tercatat benar |
| R2 Publik | F04, F08 | Landing, katalog, dan konversi rupiah tampil dari data nyata |
| R3 Pertumbuhan | F06, F07 | Promo dengan kuota bersamaan aman. Feed tampil dengan data nyata |
