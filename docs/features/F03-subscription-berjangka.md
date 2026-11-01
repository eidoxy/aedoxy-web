# F03 Subscription Berjangka (Mingguan, Bulanan)

Prioritas P0 · Rilis R1 · Bergantung pada F00, F02 · Pengelolaan paket dan harga oleh admin ada di F05

## Tujuan

Subscription adalah **satu-satunya cara membeli kredit**. Pembeli membayar harga flat untuk paket berisi kredit $ dengan masa aktif. Kredit paket diambil dari pool global (F02), hanya bisa dipakai selama masa aktif, lalu sisanya hangus dan kembali ke pool.

Contoh: Mingguan $7 selama 7 hari, Rp25.000. Harga ini hanya contoh dan ditetapkan admin di F05.

## Mekanisme: memakai subscription bawaan New API

New API sudah menyediakan semua yang dibutuhkan (`gateway-aedoxy/model/subscription.go`):

| Kebutuhan | Fitur New API |
|---|---|
| Durasi | `DurationUnit` = `hour` / `day` / `month` / `year` / `custom`, plus `DurationValue` |
| Kredit paket | `TotalAmount` (kuota) |
| Hangus | Job `ExpireDueSubscriptions` menandai subscription `expired` setelah `EndTime` |
| Saat kredit paket habis | `AllowWalletOverflow = false`, sehingga request ditolak dan tidak memotong saldo dompet |
| Grup (rate limit, akses model) | `UpgradeGroup` / `DowngradeGroup` |
| Batas pembelian | `MaxPurchasePerUser` (total seumur akun, bukan bersamaan) |
| Snapshot | `UserSubscription.AmountTotal` disalin saat pembelian, sehingga perubahan paket tidak memengaruhi paket yang sudah dibeli |
| Urutan pemakaian | Preferensi billing user (`subscription_first`, `subscription_only`, dll.). Karena saldo dompet user baru 0, hasilnya sama dengan `subscription_only` |

Peran aedoxy.com: menjual paket, memanggil `fulfill`, menampilkan status paket, dan mengembalikan sisa kredit ke pool.

## Pemetaan periode

| Periode | `duration_unit` | `duration_value` | Catatan |
|---|---|---|---|
| Mingguan | `day` | 7 | 7 × 24 jam sejak pembayaran |
| Bulanan | `day` | 30 | **Jangan pakai `month`**: New API memakai `AddDate(0, 1, 0)` sehingga panjangnya 28–31 hari, sementara yang dijanjikan 30 hari |
| Kustom (misalnya promo 24 jam) | `hour` atau `day` | bebas | Lihat F05 dan F06 |

`quota_reset_period` selalu `never` di v1, karena rekonsiliasi sisa kredit membutuhkan `amount_used` yang tidak di-reset.

## Alur

1. `/plans` menampilkan paket aktif dari tabel `plans`, dikelompokkan per periode (tab Mingguan / Bulanan). Setiap kartu menampilkan kredit $, harga flat, harga coret bila ada diskon, konversi "≈ Rp" (F04), badge, dan status stok.
2. Pembeli memilih paket. Server memeriksa paket aktif (bila ada, wajib ada konfirmasi penggantian), batas pembelian, dan stok pool, lalu membuat order dengan reservasi pool sebesar `credit_quota`.
3. Pembayaran dan webhook mengikuti F01.
4. Worker memanggil `fulfill` → New API membuat `UserSubscription` → aedoxy menyimpan `subscription_grants` (ID subscription, `ends_at`).
5. `/dashboard` menampilkan paket aktif dengan sisa kredit, bar pemakaian, dan hitung mundur, dari `GET /api/subscription/admin/users/:id/subscriptions`.
6. Setelah `ends_at`, worker rekonsiliasi mengembalikan sisa kredit ke pool (`../TRD.md` 9.4).

## Aturan

- **Hanya satu paket aktif per user** (`../PRD.md` bagian 11 nomor 3). Bila user membeli paket baru saat paket lama masih aktif, checkout menampilkan peringatan: "Paket {nama} Anda (sisa $X, berakhir {tanggal}) akan berakhir saat paket baru aktif. Sisa kreditnya hangus." Pembayaran baru bisa dimulai setelah user mencentang konfirmasi. Saat paket baru diaktifkan, bridge membatalkan paket lama dalam transaksi yang sama, dan sisa kreditnya kembali ke pool (`replace_return`).
- Jika tidak ada paket aktif, panel dan console menampilkan "Tidak ada paket aktif" dengan tombol ke `/plans`. Request API ditolak.
- Paket tidak bisa dibeli dengan saldo dompet (`AllowBalancePay = false`) atau dari console.
- Teks di halaman paket: "Kredit paket berlaku N hari sejak pembayaran. Sisa kredit hangus setelah masa aktif berakhir dan tidak dapat diuangkan."

## Tugas

| # | Tugas | Ukuran |
|---|---|---|
| 1 | Bridge `fulfill` (bagian dari F00 tugas 5) | – |
| 2 | Alur order paket + peringatan penggantian paket aktif + validasi batas pembelian dan periode jual | M |
| 3 | `subscription_grants` + job rekonsiliasi + test (sisa 0, sisa sebagian, paket fair use) | M |
| 4 | UI `/plans` (tab periode), kartu paket aktif di `/dashboard` | M |
| 5 | Pengingat paket hampir berakhir (email H-1) | S, opsional |
| 6 | Uji di console: user tanpa paket aktif ditolak, dan user dengan paket habis ditolak | S |

## Selesai bila

- Paket mingguan yang dibeli di sandbox aktif di console, bisa dipakai, berstatus `expired` setelah 7 hari, dan sisa kreditnya kembali ke pool. Untuk pengujian, pakai paket kustom 1 jam.
- Request API ditolak saat tidak ada paket aktif atau kredit paket habis.
- Pembelian yang melebihi batas ditolak sebelum invoice dibuat.
- Membeli paket kedua saat paket pertama aktif: paket pertama berstatus `cancelled`, hanya satu paket aktif di console, dan sisa kredit paket pertama kembali ke pool.
