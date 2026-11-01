# F01 Pembayaran Paket dengan Poketo (QRIS)

Prioritas P0 · Rilis R1 · Bergantung pada F00, F02, F03, F05 · Acuan: `../TRD.md` bagian 8, 9.1–9.3, dan `../../topup-pool-poketo/INTEGRASI-POKETO.md`

## Tujuan

Pembeli membayar **harga flat paket** dalam rupiah lewat Poketo. Setelah lunas, paket aktif di console secara otomatis. Tidak ada top up per dolar dan tidak ada saldo dompet yang diisi.

## Alur pembeli

1. `/plans`: pilih paket, misalnya "Bulanan $20 · Rp55.000".
2. Halaman checkout menampilkan:
   - nama paket, kredit, dan masa aktif;
   - harga flat, harga coret bila ada diskon paket, dan potongan kode promo (F06);
   - perkiraan total yang dibayar termasuk biaya Poketo (`GET /v1/payment-methods?amount=`).
3. Tekan "Bayar". Server membuat order (`../TRD.md` 9.2) lalu membuat invoice Poketo.
4. Pembeli diarahkan ke `paymentUrl`, atau halaman bayar dibuka sebagai pop-up `checkout.js`.
5. Pembeli kembali ke `/orders/[id]`, yang melakukan polling status setiap 3 detik selama 2 menit, lalu setiap 15 detik. Halaman menampilkan: menunggu pembayaran → lunas → paket aktif (dengan tanggal berakhir).
6. Bila order kedaluwarsa, tampilkan tombol "Buat order baru".

`redirectUrl` atau callback `onPaid` tidak pernah dianggap bukti lunas. Status lunas hanya berasal dari webhook dan `GET /v1/invoices/:id`.

## Aturan

| Aturan | Nilai default |
|---|---|
| Nominal | `price_idr` paket − diskon promo, minimal Rp10.000, maksimal Rp10.000.000 (QRIS) |
| Kurs | Tidak dipakai untuk nominal. Konversi "≈ Rp" hanya keterangan (F04) |
| Masa berlaku invoice | 15 menit |
| Paket aktif | Maksimal 1. Membeli paket baru menggantikan paket lama setelah user mencentang peringatan "Paket lama akan berakhir dan sisa kreditnya hangus" |
| Order pending per user | Maksimal 3 |
| Rate limit pembuatan order | 5 per menit per user |
| `trade_no` | `ADX-<yyyymmdd>-<8 karakter acak>` |
| Item invoice | Satu item: nama paket × 1 |

## Data dan endpoint

- Tabel: `orders`, `fulfillments`, `webhook_events` (`../TRD.md` bagian 6).
- Server Action `createPlanOrder({ planId, promoCode? })` → `{ orderId, paymentUrl }`.
- `GET /api/orders/[id]/status` (pemilik order saja) → status order + aktivasi paket.
- `POST /api/webhooks/poketo`.
- Admin `/admin/orders`: filter status dan paket, detail order + riwayat webhook + aktivasi, serta tombol aksi:
  - "Cek status di Poketo" (`check-status`)
  - "Ulangi aktivasi paket" (fulfillment `dead` → `queued`)
  - "Tandai refund" (catat refund, lalu jalankan langkah manual)

## Tugas

| # | Tugas | Ukuran |
|---|---|---|
| 1 | `integrations/poketo.ts` (SDK `poketo-node`): create/get/cancel invoice, payment-methods | S |
| 2 | `domain/pricing.ts` + unit test (diskon, batas nominal) | S |
| 3 | Server Action buat order + transaksi reservasi pool, stok paket, dan promo | M |
| 4 | Route webhook: verifikasi, dedupe, konfirmasi invoice, transisi status, insert outbox | M |
| 5 | Worker outbox → `fulfill` bridge, backoff, status `dead` + alert | M |
| 6 | Worker sapu order kedaluwarsa | S |
| 7 | UI checkout, `/orders`, `/orders/[id]` dengan polling | M |
| 8 | UI admin order + aksi | M |
| 9 | Test integrasi: webhook ganda, bayar terlambat, console down lalu pulih | M |
| 10 | Uji sandbox skenario dari `INTEGRASI-POKETO.md` bagian 6, diterapkan pada order paket dengan URL webhook baru | S |

## Selesai bila

- Simulate `paid` di sandbox mengaktifkan tepat satu paket di console dalam < 60 detik.
- Webhook ditolak (401) bila body diubah, timestamp lebih dari 5 menit, atau secret salah.
- Saat New API dimatikan, order tetap `paid`. Setelah New API hidup kembali, paket aktif otomatis.
- Satu transaksi live Rp10.000 tercatat sama di Poketo, `orders`, `pool_ledger`, dan console.

## Refund (manual di v1)

Saat webhook `invoice.refunded` datang, order ditandai `refunded` dan alert dikirim. Admin lalu membuka detail order:

1. Invalidasi subscription lewat `POST /api/subscription/admin/user_subscriptions/:id/invalidate`.
2. Catat ledger `refund_return` sebesar sisa kredit paket saat diinvalidasi.

Langkah ini tidak diotomatiskan karena refund jarang terjadi.
