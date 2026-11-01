# Kebutuhan Integrasi Poketo

Sumber: [poketo.id/docs](https://poketo.id/docs) dan [poketo.id/llms.txt](https://poketo.id/llms.txt),
dibaca 2026-11-01. Cek ulang sebelum implementasi karena API bisa berubah
([changelog](https://poketo.id/changelog)).

## 1. Akun dan dashboard Poketo

1. Daftar di Poketo, lalu buka **Developer → Proyek & API → buat proyek**.
2. Buat **API key sandbox** `sk_test_…`. Key hanya ditampilkan sekali.
3. Atur **URL webhook proyek**: `https://ai.aedoxy.com/api/poketo/webhook`. Simpan
   **rahasia penandatanganan** `whsec_…`.
4. Tekan **Kirim tes** (event `ping`) untuk memastikan URL bisa dijangkau.
5. Untuk live: isi **Profil usaha**, pilih jenis usaha yang sesuai (lihat README bagian 6),
   selesaikan **verifikasi identitas** (KTP + liveness), lalu buat key `sk_live_…`.
   Webhook live dan sandbox dibedakan oleh field `environment` di payload.
6. **Profil usaha → Metode pembayaran**: aktifkan QRIS. VA/PayLater/kartu opsional.
7. Siapkan rekening bank/e-wallet atas nama pemilik yang terverifikasi untuk penarikan.

## 2. Kredensial dan setting di New API

Simpan di `common.OptionMap`, sama seperti provider lain, dan atur dari halaman
setting admin. Nama option yang berakhiran `Key`/`Secret` otomatis disembunyikan dari
`GET /api/option/` (`controller/option.go`). Jangan taruh nilainya di repo,
`docker-compose.yml`, atau log.

| Option | Contoh | Keterangan |
|---|---|---|
| `PoketoSecretKey` | `sk_test_…` / `sk_live_…` | Header `Authorization: Bearer …`. Prefiks menentukan environment |
| `PoketoWebhookSecret` | `whsec_…` | Untuk verifikasi HMAC. **Wajib terisi**; bila kosong, Poketo nonaktif dan webhook menolak semua request |
| `PoketoPricePerMillion` | `25000` | Rupiah per 1.000.000 kuota |
| `PoketoMinTopUp` | `1000000` | Minimum kuota per order. Pastikan harganya ≥ Rp10.000 |
| `PoketoInvoiceExpiryMinutes` | `30` | 5–43.200 menit |
| `PoketoApiBase` | `https://poketo.id/api/v1` | Konstanta. Jadikan option hanya bila perlu |

`isPoketoTopUpEnabled()` = compliance pembayaran sudah dikonfirmasi
(`operation_setting.IsPaymentComplianceConfirmed()`) **dan** `PoketoSecretKey` serta
`PoketoWebhookSecret` keduanya tidak kosong. Pola ini mencegah kelas bug CVE-2026-41432.

Atur juga `ServerAddress` (System Settings) ke `https://ai.aedoxy.com`, karena
`redirectUrl` dibangun dari nilai itu.

## 3. Webhook

**Endpoint:** `POST /api/poketo/webhook`, tanpa login, dengan `anonymousRequestBodyLimit`.

**Header dari Poketo:**

| Header | Isi | Dipakai untuk |
|---|---|---|
| `Poketo-Signature` | `t=<unix detik>,v1=<hex HMAC-SHA256(whsec, "<t>.<raw body>")>` | Verifikasi |
| `Poketo-Event` | mis. `invoice.paid` | Routing event |
| `Poketo-Event-Id` | `evt_…`, sama di setiap percobaan ulang | Log/korelasi. Idempotensi sudah dijamin status `top_ups` |
| `Poketo-Delivery` | `whd_…`, berbeda tiap percobaan | Log |

**Langkah verifikasi (urutan wajib):**

1. Baca body mentah dengan `io.ReadAll` **sebelum** parsing apa pun. Jangan parse ulang
   lalu marshal, karena HMAC dihitung atas byte persis.
2. Parse header: ambil `t` dan semua nilai `v1`.
3. Tolak bila `|sekarang − t| > 300` detik.
4. Hitung `HMAC-SHA256(whsec, t + "." + rawBody)`, hex-decode `v1`, bandingkan dengan
   `hmac.Equal` (waktu-konstan).
5. Baru setelah itu `common.Unmarshal` body. Ambil `referenceId` (atau nomor invoice) dari payload.
6. **Konfirmasi ke sumber:** `GET /v1/invoices/:referenceId` dengan secret key. Pakai
   `status`, `amount`, dan metode pembayaran dari respons ini, bukan dari payload.
   Cocokkan `amount == top_ups.money` dan `payment_provider == poketo`.

Struktur body webhook tidak dijabarkan lengkap di dokumentasi. Dokumen menyebut
objek invoice, `metadata`, dan `environment`, sedangkan landing page menampilkan
`order.invoice_number` dan `amount`. Langkah 6 membuat handler tidak bergantung pada
bentuk body. Ambil contoh body nyata dari sandbox (simulate + riwayat pengiriman di
dashboard) sebelum menulis struct-nya.

**Kode respons (menentukan perilaku retry Poketo):**

| Kondisi | Balas | Akibat |
|---|---|---|
| Berhasil, idempoten (sudah `success`), event diabaikan (`ping`, `account.*`) | 200 | Selesai |
| Tanda tangan salah / timestamp kedaluwarsa / secret kosong | 401 | Dianggap gagal permanen (4xx), tidak diulang |
| `referenceId` tidak dikenal atau provider tidak cocok | 200 + log peringatan | Tidak membanjiri retry |
| Batas dompet terlampaui saat kredit | 200 + log error | Admin menyelesaikan manual |
| Error DB, timeout `GET /v1/invoices`, 5xx dari Poketo | 500 | Poketo mengulang: langsung, +30 dtk, +2 mnt, +10 mnt, +1 jam, +6 jam |

Balas dalam 10 detik. Pasang timeout HTTP client 5 detik untuk langkah 6.

**Event yang ditangani:** `invoice.paid`, `invoice.expired`, `invoice.cancelled`,
`invoice.refunded`. Abaikan sisanya dengan 200.

Poketo menolak redirect dan alamat jaringan privat, jadi URL webhook harus langsung
ke domain publik tanpa redirect `http → https` atau `www`.

## 4. Endpoint Poketo yang dipakai

Base URL `https://poketo.id/api/v1`, JSON, `Authorization: Bearer <PoketoSecretKey>`.

| Endpoint | Kapan | Field penting | Limit |
|---|---|---|---|
| `POST /v1/invoices` | Buat order | `amount` (int Rupiah, ≥ 10.000, wajib), `referenceId` (= `trade_no`), `title`, `customer{name,email}`, `expiresInMinutes`, `redirectUrl` (https), `metadata` (≤ 20 key) + header `Idempotency-Key`. Respons: `paymentUrl`, `id` (`INV-PKT-…`) | 60/menit |
| `GET /v1/invoices/:id` | Webhook langkah 6, penyapu | `:id` boleh `referenceId` | 120/menit |
| `POST /v1/invoices/:id/cancel` | Opsional: pembeli membatalkan order | Hanya invoice `pending`, selain itu 409 | 20/menit |
| `POST /v1/invoices/:id/check-status` | Opsional: tombol "cek pembayaran" | Maks sekali/10 detik per invoice | 30/menit |
| `POST /v1/invoices/:id/simulate` | Uji sandbox | `{ "result": "paid"\|"expired", "paymentMethod": "QRIS" }` | 30/menit |
| `GET /v1/payment-methods?amount=` | Opsional: tampilkan total yang dibayar pembeli termasuk biaya | | 120/menit |

Error berbentuk `{ "error": { "code", "message" } }`. Yang perlu ditangani:
`429` (ikuti `Retry-After`), `423 kyc_required` (melewati Rp1.000.000 sebelum KYC),
`423 business_profile_required|business_review_pending|business_rejected`,
`409 idempotency_in_progress`, `500` (aman diulang karena `referenceId` sama mengembalikan
invoice pertama).

## 5. Biaya, batas, dan pencairan

| Hal | Nilai |
|---|---|
| Siapa membayar biaya | **Pembeli.** Total = nominal + biaya layanan Poketo 0,3% (min Rp200, maks Rp1.000) + biaya DOKU + PPN 11%. Anda menerima `amount` utuh |
| Biaya QRIS (DOKU) | 0,7%; flat Rp500 + PPN untuk total ≤ Rp100.000 |
| Batas QRIS | Rp10.000 – Rp10.000.000 per transaksi |
| Sebelum KYC | Total penerimaan live maks Rp1.000.000 |
| Settlement QRIS | Siap tarik hari kerja berikutnya pukul 09.00 WIB |
| Penarikan | Min Rp50.000, biaya Rp5.275, ke rekening atas nama pemilik terverifikasi |
| Biaya bulanan | Rp0 |

Tampilkan di halaman top up bahwa total yang dibayar sedikit lebih besar dari harga
karena biaya pembayaran. Ini menghindari keluhan. `GET /v1/payment-methods?amount=` memberi
angka persisnya.

## 6. Uji di sandbox

Jalankan dengan `sk_test_`. Webhook tetap dikirim dengan `environment: "sandbox"`.

| # | Skenario | Harapan |
|---|---|---|
| 1 | Pool 0, buat order | Ditolak "stok habis", tidak ada invoice |
| 2 | Pool 10 jt, order 2 jt | `reserved = 2 jt`, invoice dibuat, `top_ups` pending |
| 3 | Simulate `paid` | Kuota user +2 jt, `reserved 0`, `sold 2 jt`, log top up tercatat |
| 4 | Kirim ulang webhook yang sama dari dashboard | 200, kuota tidak bertambah lagi |
| 5 | Dua webhook paid bersamaan | Kuota hanya bertambah sekali |
| 6 | Simulate `expired` | `reserved` kembali, status `expired` |
| 7 | Order expired lalu dibayar (lihat catatan) | Kuota dikredit, `sold` naik, ledger `late_sell` |
| 8 | Body diubah 1 byte / `t` > 5 menit / secret salah | 401, tidak ada perubahan |
| 9 | Kosongkan `PoketoWebhookSecret` | Metode Poketo hilang dari halaman top up, webhook 401 |
| 10 | Matikan jaringan ke Poketo saat buat order | Order `failed`, reservasi dilepas |
| 11 | Hapus webhook expired (hentikan endpoint), tunggu penyapu | Reservasi dilepas oleh penyapu |
| 12 | Admin menyelesaikan order Poketo manual | Kuota = `amount`, pool berubah seperti skenario 3 |

Catatan skenario 7: simulate di sandbox hanya untuk invoice `pending`, jadi skenario ini
kemungkinan besar harus diuji lewat unit test `RechargePoketo` dengan status awal `expired`.

## 7. Checklist go-live

- [ ] Profil usaha disetujui dengan deskripsi "layanan API AI / kredit pemakaian", sudah dikonfirmasi ke Poketo
- [ ] KYC selesai, rekening penarikan valid
- [ ] `sk_live_` + `whsec_` live terpasang, key sandbox dihapus dari setting produksi
- [ ] URL webhook live terdaftar, **Kirim tes** dibalas 200
- [ ] `ServerAddress` = `https://ai.aedoxy.com`, dan `Caddyfile` memakai domain yang sama
- [ ] Provider pembayaran lain dimatikan (atau keputusan sadar bahwa provider itu tidak memotong pool)
- [ ] Pool diisi sesuai kredit upstream yang benar-benar dibeli
- [ ] Backup database sebelum deploy migrasi
- [ ] Transaksi live Rp10.000: cocok di dashboard Poketo, `top_ups`, ledger pool, dan kuota user
- [ ] Peringatan admin untuk pool negatif dan error kredit (notifikasi yang sudah ada di New API atau log)
- [ ] Rekonsiliasi harian/mingguan: ekspor CSV Poketo dibandingkan dengan `top_ups` berstatus `success`
