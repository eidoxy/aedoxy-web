# Top Up Kredit dari Pool Global + Poketo (QRIS)

> **Digantikan (2026-11-01).** Arsitektur sekarang memakai aplikasi Next.js terpisah di aedoxy.com. Lihat `../docs/README.md` dan `../docs/TRD.md`. `README.md` dan `ARSITEKTUR.md` di folder ini hanya arsip. `INTEGRASI-POKETO.md` masih berlaku sebagai acuan detail Poketo, dengan URL webhook baru `https://aedoxy.com/api/webhooks/poketo`.

Rancangan untuk New API fork `gateway-aedoxy` (domain target: ai.aedoxy.com).
Disusun 2026-11-01 dari pembacaan kode fork (commit `fcb3f363b`, branch `develop`)
dan dokumentasi Poketo ([poketo.id/docs](https://poketo.id/docs), [poketo.id/llms.txt](https://poketo.id/llms.txt)).

| File | Isi |
|---|---|
| `README.md` | Jawaban inti, keputusan, strategi bertahap, keputusan bisnis yang terbuka |
| `ARSITEKTUR.md` | Peta kode yang ada, skema data, alur, file yang disentuh, dependensi |
| `INTEGRASI-POKETO.md` | Kredensial, webhook, endpoint API, batas, uji sandbox, checklist go-live |

## 1. Apakah harus membuat sendiri?

Ya. Ada dua alasan yang terlihat langsung dari kode:

1. **Tidak ada konsep pool.** Saldo hanya ada per user (`users.quota`). Setiap top up
   menambah `quota` user lewat `creditTopUpQuota()` di `gateway-aedoxy/model/topup.go`
   tanpa mengurangi stok apa pun.
2. **Tidak ada provider Poketo.** Provider yang ada: Epay, Stripe, Creem, Waffo,
   Waffo Pancake (`PaymentProvider*` di `model/topup.go`). Epay memakai protokol
   bergaya EPay (PID + key + MD5), sedangkan Poketo memakai REST + Bearer key +
   webhook HMAC-SHA256. Poketo tidak bisa dipasang lewat pengaturan Epay.

Modifikasi Anda di fork sejauh ini hanya branding, sidebar, Caddy, dan workflow deploy
(19 file, `git diff upstream/main...develop`). Jalur pembayaran masih 100% upstream.

## 2. Keputusan: provider native di dalam fork

Sebelumnya saya menyarankan layanan sidecar terpisah. Setelah membaca kodenya, saran
saya berubah ke **provider native di dalam fork Go**. Alasannya:

- Pengurangan pool dan penambahan kuota user bisa dilakukan dalam **satu transaksi
  database**, berdampingan dengan `creditTopUpQuota()` dan row lock `lockForUpdate()`
  yang sudah ada. Dengan sidecar, dua sistem harus disinkronkan, dan kegagalan di
  tengah jalan bisa membuat stok terpotong tanpa kuota masuk, atau sebaliknya.
- Kode sudah punya pola yang sama untuk 5 provider: buat order `TopUp` berstatus
  `pending`, lalu webhook memanggil fungsi `Recharge*` yang idempoten. Poketo cukup
  menjadi provider ke-6.
- Halaman top up, riwayat top up, log, dan penyelesaian order manual oleh admin (`AdminCompleteTopUp`) langsung
  ikut bekerja.

Biayanya: setiap merge dari upstream bisa konflik. Untuk memperkecilnya, taruh kode
baru di file baru (`topup_poketo.go`, `credit_pool.go`) dan sentuh file bersama
seminimal mungkin. Daftarnya ada di `ARSITEKTUR.md` bagian 5.

Lisensi New API adalah **AGPL-3.0** (`gateway-aedoxy/LICENSE`). Karena fork
dijalankan sebagai layanan publik, kode modifikasinya wajib tersedia untuk pengguna.
Repo `eidoxy/gateway-aedoxy` sudah publik di GitHub, jadi syarat ini terpenuhi selama
kode Poketo ikut di-push ke sana. Jangan menaruh secret di kode.

## 3. Konsep

- **Satuan.** "Token" di New API dengan tampilan `TOKENS` adalah **unit kuota**, bukan
  token model. Default `QuotaPerUnit = 500.000` kuota = US$1. Pemakaian kuota per
  request = token model × rasio model × rasio grup (× rasio completion). Jadi
  1 juta "token" kuota tidak sama dengan 1 juta token model. Tulis hal ini dengan
  jelas di halaman harga agar pembeli tidak merasa dirugikan.
- **Pool global.** Satu baris angka stok kuota yang boleh dijual:
  `tersedia = total − direservasi − terjual`. Admin menambah `total` setiap kali
  membeli kredit upstream. Pool tidak tersambung otomatis ke saldo OpenAI/Anthropic.
- **Harga.** Setting baru `PoketoPricePerMillion` (Rupiah per 1.000.000 kuota).
  Nominal tagihan = `ceil(kuota × harga / 1.000.000)`, dalam Rupiah bulat.
- **Siklus stok per order:**
  `buat order → reservasi` · `lunas → reservasi pindah ke terjual` ·
  `kedaluwarsa/batal → reservasi dilepas` · `refund → sisa kuota user ditarik dan
  dikembalikan ke pool`.
- **Pemakaian token tidak menyentuh pool.** Stok sudah keluar dari pool saat top up.

## 4. Strategi bertahap

| Fase | Isi | Selesai bila |
|---|---|---|
| 0. Persiapan | Akun Poketo, proyek sandbox, `sk_test_` + `whsec_`, kategori usaha (lihat bagian 6) | Key sandbox tersimpan, URL webhook terdaftar |
| 1. Pool | Tabel `credit_pools` + `credit_pool_ledgers`, endpoint admin tambah/kurangi pool, endpoint publik sisa pool | Admin bisa mengisi pool; angka konsisten setelah restart |
| 2. Order Poketo | `POST /api/user/poketo/pay`: validasi, reservasi pool + insert `TopUp` dalam satu transaksi, buat invoice Poketo, kembalikan `paymentUrl` | Order sandbox membuat invoice dan reservasi |
| 3. Webhook | `POST /api/poketo/webhook`: verifikasi tanda tangan, konfirmasi `GET /v1/invoices/:id`, `RechargePoketo()` (paid), lepas reservasi (expired/cancelled), tangani refund | Simulasi paid/expired di sandbox mengubah kuota dan pool dengan benar, termasuk webhook ganda |
| 4. Penyapu + admin | Goroutine penyapu order pending yang lewat masa berlaku, cabang Poketo di `ManualCompleteTopUp` | Order yatim (invoice gagal dibuat, webhook hilang) melepas reservasi |
| 5. Frontend | Tombol Poketo di halaman wallet, tampilan sisa pool, form setting admin | Alur pembeli lengkap dari browser |
| 6. Go-live | KYC, profil usaha disetujui, ganti ke `sk_live_`, transaksi nyata kecil | Satu transaksi live Rp10.000 tercatat benar di Poketo, `top_ups`, dan pool |

## 5. Keputusan bisnis yang perlu Anda tetapkan

Rancangan memakai default di kolom kanan. Ubah bila tidak sesuai.

| Pertanyaan | Default rancangan |
|---|---|
| Pembeli membayar invoice yang sudah kedaluwarsa (Poketo tetap menandainya `paid`) dan pool sudah habis | **Tetap kreditkan.** Uang sudah diterima. Pool boleh negatif, lalu admin diberi peringatan untuk menambah pool |
| Refund/chargeback setelah kuota terpakai | Tarik sisa kuota user sebanyak-banyaknya sebesar kuota top up itu, kembalikan bagian yang tertarik ke pool, catat selisihnya, tinjau user secara manual |
| Apakah kode redeem, bonus undangan, check-in, dan edit kuota admin ikut memotong pool? | **Tidak**, karena jalur itu memanggil `IncreaseUserQuota`/update langsung, bukan `creditTopUpQuota`. Jika Anda menjual kode redeem di luar sistem, pembuatan kode harus ikut mereservasi pool (pekerjaan tambahan) |
| Provider lain (Epay/Stripe/dll.) tetap aktif? | Matikan. Hanya Poketo yang memotong pool. Jika provider lain hidup, top up lewat jalur itu tidak mengurangi pool |
| Masa berlaku invoice | 30 menit (`expiresInMinutes`), agar reservasi tidak lama tertahan |
| Batas nominal | Min Rp10.000 (aturan Poketo), maks Rp10.000.000 per transaksi QRIS (aturan BI) |
| Paket | Gunakan paket tetap lewat `AmountOptions` (mis. 2 jt, 5 jt, 10 jt kuota) agar harga bulat |

## 6. Risiko dan kepatuhan

- **Kebijakan Poketo.** [Acceptable use](https://poketo.id/acceptable-use) melarang
  "jual beli akun ... serta kredensial". Jika Anda menyebut usaha ini "jual API key",
  peninjau bisa membacanya sebagai jual-beli kredensial. Daftarkan usaha sebagai
  **layanan API AI / kredit pemakaian jasa digital milik sendiri** dan tanyakan
  langsung ke contact@dahono.com sebelum go-live. Poketo juga memantau pola seperti
  "nominal bulat berulang" dan "akun baru dengan volume tinggi", jadi bersiaplah
  memberi penjelasan atau dokumen.
- **Ketentuan upstream.** OpenAI, Anthropic, dan penyedia lain membatasi penjualan
  ulang akses. Pastikan kunci upstream Anda resmi dan penggunaannya diizinkan.
- **Status Poketo.** Poketo adalah agregator, bukan PJP. Dananya diproses DOKU (PJP
  berizin BI), dan saldo Poketo hanya catatan piutang. Sebelum KYC, total penerimaan
  live dibatasi Rp1.000.000.
- **Domain.** `gateway-aedoxy/Caddyfile` masih menulis `ai.obersa.my.id`. URL webhook
  dan `redirectUrl` harus memakai domain yang benar-benar melayani gateway.
- **Keamanan webhook.** New API pernah terkena CVE-2026-41432 (webhook Stripe dengan
  secret kosong yang bisa dipalsukan). Aturan pengamannya ada di `INTEGRASI-POKETO.md`
  bagian 3.
