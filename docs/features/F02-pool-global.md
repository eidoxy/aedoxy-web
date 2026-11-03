# F02 Pool Kredit Global

Prioritas P0 · Rilis R1 · Acuan: `../TRD.md` D5, 9.2–9.4, 10

## Tujuan

Admin menentukan berapa kredit yang boleh dijual. **Setiap paket yang terjual mengambil kreditnya dari pool ini.** Contoh: pool $1.000. Setelah 10 paket Bulanan $20 terjual, sisa pool $800.

## Konsep

- **Satuan**: kuota New API. $1 = `quota_per_unit` (default 500.000). Panel menampilkan dalam $.
- **Tersedia** = `total − direservasi − terjual`.
- Pool tidak tersambung otomatis ke saldo OpenAI, Anthropic, atau provider lain. Admin menambah `total` setiap kali membeli kredit upstream.
- Pemakaian API oleh user **tidak** mengubah pool, karena kredit paket sudah keluar dari pool saat paket dijual.
- Sisa kredit paket yang hangus kembali ke pool, karena kredit itu tidak pernah dipakai di upstream.

## Perubahan pool per peristiwa

`q` = kredit paket (untuk paket fair use, `q` = batas fair use).

| Peristiwa | Perubahan | Ledger |
|---|---|---|
| Admin menambah/mengurangi stok | `total ± n` | `admin_adjust` (catatan wajib) |
| Order paket dibuat | `reserved += q` bila tersedia ≥ q | `reserve` |
| Order lunas | `reserved −= q`, `sold += q` | `sell` |
| Order kedaluwarsa / dibatalkan / gagal | `reserved −= q` | `release` |
| Lunas setelah kedaluwarsa | `sold += q` (boleh membuat tersedia < 0) | `late_sell` |
| Paket hangus dengan sisa kredit | `sold −= sisa` | `expire_return` |
| Paket digantikan paket baru sebelum masa aktifnya habis | `sold −= sisa paket lama` | `replace_return` |
| Refund (admin) | `sold −= sisa kredit saat diinvalidasi` | `refund_return` |

Contoh: pool $1.000. User membeli Bulanan $20 dan memakai $12 selama 30 hari. Saat paket hangus, $8 kembali ke pool, sehingga pool terjual bersihnya $12.

## UI admin `/admin/pool`

- Kartu: total, direservasi, terjual, tersedia (dalam $ dan kuota), persentase terpakai, serta perkiraan berapa paket per jenis yang masih bisa dijual.
- Form tambah/kurangi stok: nominal $, catatan wajib. Tanpa kode 2FA per aksi (hanya sesi admin dengan 2FA); tercatat di audit.
- Ambang "stok hampir habis" (default 10% dari total).
- Tabel ledger dengan filter tipe dan tanggal, serta ekspor CSV.
- Status invariant terakhir: "reserved cocok" atau "selisih N, perlu diperiksa".

## Tampilan publik

`GET /api/public/pool-status` (cache 60 detik) mengembalikan `available` / `low` / `sold_out`, bukan angka. Paket yang kreditnya lebih besar dari stok tersedia ditandai "Habis", dan tombol belinya dinonaktifkan dengan keterangan dari admin (misalnya kapan stok diisi ulang).

## Tugas

| # | Tugas | Ukuran |
|---|---|---|
| 1 | Skema `credit_pool` (seed 1 baris) + `pool_ledger` | S |
| 2 | `domain/pool.ts`: `reserve`, `sell`, `release`, `lateSell`, `returnExpired`, `adjust`, semuanya dengan `UPDATE` bersyarat dalam transaksi pemanggil | M |
| 3 | Test integrasi: 100 order paralel dengan stok cukup untuk 10 paket → tepat 10 sukses, dan total konsisten | S |
| 4 | UI admin pool + audit | M |
| 5 | Endpoint status publik + status "Habis" per paket | S |
| 6 | Job invariant + alert ambang | S |

## Selesai bila

- Tidak ada urutan request yang membuat `tersedia < 0`, kecuali `late_sell`.
- Σ ledger per tipe sama dengan nilai kolom pool.
- Order yang dibuat lalu kedaluwarsa mengembalikan stok dalam ≤ 15 menit (webhook atau sapu).
- Paket yang hangus mengembalikan sisa kreditnya dalam ≤ 30 menit setelah `ends_at`.

## Catatan

- Kredit yang dibuat lewat jalur lain di console (kuota user baru, bonus undangan, check-in, kode redeem, edit kuota manual, top up console) tidak mengurangi pool. Matikan jalur-jalur itu (`../TRD.md` 7.3), atau catat secara manual sebagai `admin_adjust` negatif.
- Batas order pending per user dan masa berlaku 15 menit mencegah orang mengunci seluruh stok dengan order yang tidak dibayar.
