# F06 Promo dan Diskon

Prioritas P2 · Rilis R3 · Bergantung pada F01, F03, F05 · Acuan: `../TRD.md` bagian 6 (`promotions`, `promotion_redemptions`), 9.2

## Tujuan

Admin menjalankan dua jenis promosi tanpa kode:

1. **Diskon promo**: persen atau nominal untuk semua paket atau paket tertentu. Diskon bisa otomatis selama periode tertentu, atau memakai kode promo.
2. **Paket promo**: paket khusus seperti "Unlimited 24 jam, Rp50.000". Paket ini adalah paket F05 dengan periode jual, stok, dan fair use.

Diskon permanen yang sederhana cukup dilakukan lewat harga flat + harga coret di F05. Fitur ini untuk diskon yang butuh periode, kode, kuota, atau batas per user.

## Diskon

| Field | Keterangan |
|---|---|
| Jenis | `percent` (1–90%) atau `fixed` (Rp) |
| Berlaku untuk | Semua paket, atau paket tertentu |
| Kode | Kosong = diskon otomatis. Diisi = harus dimasukkan pembeli (tidak peka huruf besar/kecil) |
| Periode | Mulai dan selesai (WIB) |
| Kuota total | Jumlah pemakaian maksimum |
| Batas per user | Default 1 |

Aturan perhitungan:
- Hanya satu diskon per order. Jika ada diskon otomatis dan kode, pakai yang paling menguntungkan pembeli, lalu tampilkan alasannya.
- `harga_akhir = max(Rp10.000, harga_flat − potongan)`, dibulatkan ke atas per Rp100. Potongan dihitung dari harga flat, bukan dari harga coret.
- Kuota dipakai dengan update bersyarat saat order dibuat (`redeemed_count < max_redemptions`), dikonfirmasi saat lunas, dan dikembalikan saat order kedaluwarsa. Batas per user dihitung dari `promotion_redemptions` berstatus `reserved` atau `used`.
- Diskon tidak mengubah kredit. Diskon hanya mengurangi harga.

## Paket promo "Unlimited 24 jam"

> Hanya contoh, belum diterapkan (`../PRD.md` bagian 11 nomor 1). Bagian ini jadi acuan bila nanti dipakai.

Kredit upstream itu terbatas, jadi tidak ada paket yang benar-benar tanpa batas. Satu user yang memakai script bisa menghabiskan biaya upstream yang jauh melebihi Rp50.000 dalam 24 jam. Rancangan yang disarankan:

| Pengaman | Implementasi |
|---|---|
| Batas fair use | `TotalAmount` = batas (misalnya $X), bukan 0. Ditulis di halaman paket: "Unlimited* · fair use $X / 24 jam" |
| Rate limit | `UpgradeGroup` ke grup khusus, misalnya `promo-unlimited`, dengan batas request per menit lewat `ModelRequestRateLimitGroup` di New API |
| Akses model | Grup itu hanya boleh memakai model tertentu (pengaturan grup per model di console) |
| Batas pembelian | `max_purchase_per_user` (paket aktif selalu maksimal 1) |
| Stok | `stock_limit` per periode promo |
| Pool | Reservasi pool sebesar batas fair use. Sisanya dikembalikan setelah 24 jam |
| Saldo dompet | `AllowWalletOverflow = false`, agar pemakaian berhenti saat batas tercapai dan tidak memotong dompet tanpa disadari |

Kata "unlimited" dengan batas tersembunyi bisa dianggap iklan menyesatkan. Tulis batasnya dengan jelas di dekat harga, dan di syarat layanan.

## Alur pembeli

1. Di `/plans`, diskon otomatis langsung terlihat sebagai harga coret pada paket yang berlaku.
2. Pembeli bisa mengisi kolom "Kode promo". Server memvalidasi dan menampilkan potongan beserta alasan jika ditolak: kedaluwarsa, kuota habis, tidak berlaku untuk paket ini, atau sudah dipakai.
3. Order menyimpan `promotion_id`, `list_price_idr`, `discount_idr`, dan `amount_idr`.

## UI admin `/admin/promos`

- Tabel promo: status (terjadwal / aktif / selesai), pemakaian / kuota, total potongan, pendapatan.
- Form promo dengan pratinjau harga untuk contoh paket.
- Tombol "Hentikan sekarang".

## Tugas

| # | Tugas | Ukuran |
|---|---|---|
| 1 | Skema + `domain/pricing.ts` (pemilihan diskon, pembulatan) + unit test | M |
| 2 | Reservasi kuota promo dalam transaksi order + test 50 order paralel pada kuota 10 | S |
| 3 | Field kode promo + harga coret di UI pembeli | S |
| 4 | UI admin promo | M |
| 5 | Grup `promo-unlimited` di New API + paket promo contoh | S |

## Selesai bila

- Kuota promo tidak pernah terlampaui pada order bersamaan.
- Order kedaluwarsa mengembalikan kuota promo.
- Paket unlimited berhenti memproses request setelah batas fair use tercapai (uji di console).
