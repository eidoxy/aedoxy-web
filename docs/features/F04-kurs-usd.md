# F04 Kurs USD → IDR untuk Tampilan

Prioritas P1 · Rilis R2 · Acuan: `../TRD.md` D7, bagian 6 (`fx_settings`, `fx_rates`), 10

## Tujuan

Menampilkan nilai kredit $ dalam rupiah sebagai keterangan, agar pembeli mudah memahami nilai paket dan sisa kreditnya. Contoh: "$10 ≈ Rp181.480".

**Kurs tidak pernah dipakai untuk menghitung harga atau nominal pembayaran.** Yang dibayar user selalu harga flat paket (F05). User juga tidak bisa membeli kredit dalam dolar.

## Tempat konversi ditampilkan

| Tempat | Contoh |
|---|---|
| Kartu paket di `/plans` dan landing | "$20 kredit · setara ≈ Rp362.960 · bayar **Rp55.000**" |
| Paket aktif di `/dashboard` | "Sisa $7,40 (≈ Rp134.295) · berakhir 3 hari lagi" |
| Katalog model `/models` | Harga resmi per 1 juta token dalam $ dan ≈ Rp |
| Admin | Nilai pool dalam $ dan ≈ Rp |

Aturan tampilan:
- Konversi selalu memakai tanda "≈", dengan ukuran lebih kecil dan warna lebih redup daripada harga flat.
- Tooltip atau catatan kaki menyebut sumber dan waktu pembaruan, misalnya "Kurs Rp18.148 / $1, ECB, 30 Okt 2026".
- Pembulatan konversi: Rp1 untuk nilai kecil, atau ke Rp100 terdekat bila diatur admin.
- Admin bisa mematikan konversi sepenuhnya (`show_conversion = false`).

Konversi kredit ke kurs pasar bisa membuat paket terlihat sangat murah dibandingkan "nilainya". Itu memang tujuan tampilan ini, tetapi pastikan kalimatnya tidak menjanjikan hal lain. Gunakan kata "setara", bukan "senilai uang" atau "dapat ditukar".

## Mode kurs

| Mode | Perilaku |
|---|---|
| **Manual** | Admin mengisi angka tetap, misalnya Rp18.000 / $1 |
| **Otomatis** (disarankan) | Mengikuti kurs pasar dari sumber di bawah, diperbarui setiap `refresh_hours` (default 12 jam) |

Karena kurs hanya untuk tampilan, tidak diperlukan pengali, margin, atau batas perubahan harga. Pengaman yang tersisa hanya untuk mencegah tampilan yang jelas salah.

## Sumber kurs

| Sumber | Data | Contoh nilai | Catatan |
|---|---|---|---|
| [Frankfurter](https://frankfurter.dev/) (utama) | Kurs referensi ECB, hari kerja | Rp18.148 (2026-10-30) | Tanpa API key. Endpoint: `api.frankfurter.dev/v1/latest?base=USD&symbols=IDR` |
| [open.er-api.com](https://www.exchangerate-api.com/docs/free) (cadangan) | ExchangeRate-API versi gratis, harian | Rp18.131,95 (2026-11-01) | Tanpa API key. Wajib mencantumkan atribusi sesuai syarat penggunaannya |
| JISDOR Bank Indonesia | Kurs referensi resmi IDR | – | Tidak ada API publik resmi. Pakai sebagai pembanding manual |

Rekomendasi: pakai mode otomatis dengan Frankfurter, karena datanya berasal dari bank sentral (ECB), gratis, dan stabil. Pembaruan lebih sering dari 12 jam tidak berguna, karena kedua sumber hanya memperbarui datanya sekali sehari.

## Pengaman

| Kondisi | Tindakan |
|---|---|
| Sumber utama gagal | Pakai sumber cadangan |
| Kedua sumber gagal, atau data lebih tua dari `stale_after_hours` (72 jam) | Tetap tampilkan kurs terakhir beserta tanggalnya, dan kirim alert |
| Selisih antar sumber > `divergence_alert_pct` (2%) | Pakai sumber utama, kirim alert |
| Nilai di luar rentang wajar (misalnya < Rp5.000 atau > Rp50.000) | Abaikan nilai baru, kirim alert |

## UI admin `/admin/fx`

- Mode: manual / otomatis.
- Manual: input kurs. Otomatis: interval, pembulatan tampilan.
- Toggle "Tampilkan konversi rupiah".
- Panel status: kurs dari kedua sumber beserta tanggalnya, kurs yang sedang dipakai, dan waktu pembaruan berikutnya.
- Grafik 30 hari dan tombol "Perbarui sekarang". Perubahan masuk audit log.

## Tugas

| # | Tugas | Ukuran |
|---|---|---|
| 1 | Skema `fx_settings` + `fx_rates` | S |
| 2 | `integrations/fx.ts` (2 sumber, timeout 5 detik, validasi Zod) | S |
| 3 | Fungsi murni `selectDisplayRate(prev, samples, settings)` + unit test baris tabel pengaman | S |
| 4 | Job worker + alert | S |
| 5 | Komponen `<UsdIdr value={quota} />` yang dipakai di semua tempat tampilan | S |
| 6 | UI admin + grafik | M |

## Selesai bila

- Tidak ada jalur kode yang memakai kurs untuk `amount_idr` order. Pastikan dengan test dan review `domain/pricing.ts`.
- Setiap konversi di UI memakai komponen yang sama, dengan tanda "≈" dan sumber kurs.
- Kurs yang basi tetap tampil dengan tanggalnya, dan admin menerima alert.
