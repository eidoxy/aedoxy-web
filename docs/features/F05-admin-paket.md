# F05 Pengelolaan Paket dan Harga Flat oleh Admin

Prioritas P0 · Rilis R1 · Bergantung pada F03 · Acuan: `../TRD.md` 7.2 (endpoint plan), bagian 6 (`plans`)

## Tujuan

Admin membuat paket langganan dan mengatur harga flat serta diskonnya kapan saja dari dashboard, tanpa kode. Sistem tidak menghitung atau menyarankan harga. Penentuan harga dibahas setelah sistem selesai.

Contoh susunan paket (bukan harga final):

| Periode | Kredit | Harga flat |
|---|---|---|
| Mingguan | $5 | Rp20.000 |
| Mingguan | $7 | Rp25.000 |
| Mingguan | $11 | Rp35.000 |
| Bulanan | $10 | Rp40.000 |
| Bulanan | $20 | Rp55.000 |
| Bulanan | $40 | Rp100.000 |

## Form paket

| Field | Keterangan | Disinkronkan ke New API |
|---|---|---|
| Nama, subjudul, badge ("Terlaris", "Promo") | Tampilan | Nama dan subjudul |
| Periode | Mingguan (7 hari), Bulanan (30 hari), atau kustom (jam/hari) | `DurationUnit`, `DurationValue` (lihat F03) |
| Kredit ($) | Diubah ke kuota (`× quota_per_unit`) | `TotalAmount` |
| **Harga flat (Rp)** | Nominal yang dibayar user. Bilangan bulat, ≥ Rp10.000. Bebas diubah kapan saja | Tidak (`PriceAmount` diisi 0) |
| **Harga coret (Rp)** | Opsional. Bila diisi, kartu paket menampilkan harga coret dan persentase hemat | Tidak |
| Fair use | Untuk paket "unlimited" (F06). Kredit = batas fair use | `TotalAmount` = batas |
| Grup setelah beli | Opsional, untuk rate limit dan akses model | `UpgradeGroup` |
| Batas pembelian per user (total) | 0 = tanpa batas | `MaxPurchasePerUser` |
| Stok paket | Jumlah maksimum terjual, kosong = tanpa batas | Tidak |
| Periode jual | Mulai/selesai, opsional | Tidak |
| Aktif, urutan | | `Enabled`, `SortOrder` |

Selalu dikirim ke New API: `AllowBalancePay = false`, `AllowWalletOverflow = false`, `QuotaResetPeriod = never`, `Currency = USD`.

## Diskon

Ada dua cara memberi diskon:

1. **Langsung di paket**: ubah harga flat dan isi harga coret. Cara ini paling sederhana untuk diskon yang berlaku untuk semua orang. Contoh: harga coret Rp55.000, harga flat Rp45.000, tampil "Hemat 18%".
2. **Lewat promo (F06)**: kode promo, atau diskon berperiode untuk beberapa paket sekaligus, dengan kuota dan batas per user.

Perubahan harga atau diskon hanya berlaku untuk order baru. Order `pending` tetap memakai harga saat order dibuat, karena invoice Poketo sudah terbit dengan nominal itu.

## Alur sinkronisasi

1. Admin menyimpan paket. Dalam transaksi, aedoxy menyimpan `plans` + audit log.
2. Bila field yang disinkronkan berubah, server memanggil `POST` (paket baru) atau `PUT /api/subscription/admin/plans/:id`, lalu menyimpan `newapi_plan_id` dan `synced_at`. Perubahan harga atau diskon saja tidak perlu sinkronisasi.
3. Jika sinkronisasi gagal, paket tetap tersimpan tetapi ditandai "belum tersinkron" dan tidak dijual. Job sinkronisasi per jam mencoba lagi.
4. Paket dengan `synced_at` kosong, atau yang lebih lama dari perubahan terakhir pada field tersinkron, tidak bisa dibeli. Ini mencegah pembeli membayar paket yang isinya di New API berbeda.

## Aturan perubahan

- Perubahan kredit, periode, atau grup hanya berlaku untuk pembelian berikutnya. Paket yang sudah dibeli memakai snapshot di `UserSubscription` dan `orders.plan_snapshot`.
- Paket tidak dihapus, hanya dinonaktifkan (`PATCH` status). Ini menjaga riwayat order dan rekonsiliasi.
- Mengubah kredit paket yang sudah pernah terjual memunculkan konfirmasi, karena pembeli lama dan baru akan mendapat isi berbeda dengan nama yang sama. Alternatifnya, duplikat paket menjadi paket baru.

## UI `/admin/plans`

- Tabel paket per periode: nama, kredit, harga flat, harga coret, terjual / stok, status sinkron, aktif.
- Edit harga langsung di tabel (inline) untuk perubahan cepat, dengan konfirmasi.
- Drag untuk mengurutkan. Duplikasi paket sebagai dasar paket baru.
- Detail paket: grafik penjualan, pendapatan, dan rata-rata pemakaian kredit (kredit terpakai ÷ kredit dijual, dari `subscription_grants`). Data ini disiapkan untuk diskusi harga nanti.

## Tugas

| # | Tugas | Ukuran |
|---|---|---|
| 1 | Skema `plans` + Zod schema form | S |
| 2 | Form + tabel admin dengan edit harga inline (komponen shadcn: Form, DataTable, Sheet) | M |
| 3 | Sinkronisasi ke New API + job retry + status sinkron | M |
| 4 | Tampilan harga coret dan persentase hemat di kartu paket | S |
| 5 | Statistik penjualan dan pemakaian per paket | S |

## Selesai bila

- Paket yang dibuat di dashboard muncul di New API dengan kredit dan durasi yang sama, dan bisa dibeli di `/plans`.
- Mengubah harga flat langsung berlaku untuk order baru tanpa deploy dan tanpa sinkronisasi ulang.
- Mengubah kredit paket tidak mengubah paket yang sudah aktif milik user.
- Paket yang gagal sinkron tidak bisa dibeli.
