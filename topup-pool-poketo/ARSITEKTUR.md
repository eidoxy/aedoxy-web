# Arsitektur Top Up Pool Global + Poketo

Semua path relatif terhadap `gateway-aedoxy/`.

## 1. Gambaran

```
 Pembeli (browser)                  gateway-aedoxy (Go, Gin, GORM)                     Poketo
 ─────────────────                  ──────────────────────────────                     ──────
 Halaman Wallet ──POST /api/user/poketo/pay──▶ RequestPoketoPay
                                     │ 1. validasi kuota & nominal
                                     │ 2. TX: reservasi pool + insert top_ups(pending)
                                     │ 3. POST /v1/invoices ───────────────────────────▶ buat invoice
                                     │◀──────────────────────────── paymentUrl ────────┘
 ◀────────── paymentUrl ─────────────┘
 Bayar QRIS di pay.poketo.id ─────────────────────────────────────────────────────────▶ DOKU
                                                                                         │
                                    PoketoWebhook ◀── POST /api/poketo/webhook ──────────┘
                                     │ 1. verifikasi Poketo-Signature (HMAC, ±5 menit)
                                     │ 2. GET /v1/invoices/:referenceId (sumber kebenaran)
                                     │ 3. TX: lock top_ups → update pool → creditTopUpQuota
                                     └ 4. balas 2xx (< 10 detik)

 Admin ──POST /api/credit-pool/adjust──▶ tambah/kurangi total pool + ledger
 Penyapu (goroutine) ──────────────────▶ lepas reservasi order pending yang kedaluwarsa
```

Infrastruktur tetap seperti `docker-compose.yml` sekarang: Caddy (HTTPS publik), Postgres 15,
Redis. Tidak ada service baru.

## 2. Peta kode yang sudah ada

| Bagian | Lokasi | Fungsi |
|---|---|---|
| Model order | `model/topup.go` `TopUp` | `user_id`, `amount`, `money`, `trade_no` (unik), `payment_method`, `payment_provider`, `status`, waktu |
| Status | `common/constants.go` | `pending`, `success`, `failed`, `expired` |
| Kredit kuota atomik | `model/topup.go` `creditTopUpQuota(tx, ...)` | `UPDATE users SET quota = quota + ? WHERE id = ? AND quota <= batas` dalam transaksi pemanggil |
| Contoh settlement | `model/topup.go` `RechargeEpay`, `RechargeWaffoPancake` | `lockForUpdate` baris `top_ups` → cek provider → idempoten bila `success` → simpan → `creditTopUpQuota` → di luar TX: `syncCreditUserQuotaCache` + `RecordTopupLog` |
| Penyelesaian manual | `model/topup.go` `ManualCompleteTopUp` | Menghitung kuota dari `Amount × QuotaPerUnit` untuk selain Stripe. **Perlu cabang Poketo** |
| Info halaman top up | `controller/topup.go` `GetTopUpInfo` | Menyusun `pay_methods`, `enable_*_topup`, `min_topup`, `amount_options`, `discount` |
| Hitung harga | `controller/topup.go` `getPayMoney`, `controller/topup_waffo_pancake.go` `getWaffoPancakePayMoney` | Nominal × harga unit × rasio grup top up × diskon |
| Gerbang aktif/nonaktif | `controller/payment_webhook_availability.go` | `isXxxTopUpEnabled()`: compliance dikonfirmasi + kredensial terisi |
| Route | `router/api-router.go` | Webhook anonim di `apiRouter` dengan `anonymousRequestBodyLimit`; order user di `selfRoute` dengan `middleware.CriticalRateLimit()`; admin dengan `middleware.AdminAuth()`/`RootAuth()` |
| Setting | `model/option.go` `common.OptionMap[...]` + `setting/` | Disimpan di tabel options, disinkronkan `SyncOptions`. Key berakhiran `Key`/`Secret`/`Token` disembunyikan dari `GET /api/option/` (`controller/option.go`) |
| Migrasi | `model/main.go` `DB.AutoMigrate(...)` | Daftarkan model baru di sini |
| Background job | `main.go` | Pola `go model.Xxx(...)` saat startup |
| Frontend wallet | `web/src/features/wallet/` (`api.ts`, `lib/payment.ts`, `components/recharge-form-card.tsx`) | Form top up dan pemanggilan endpoint bayar |
| Frontend setting | `web/src/features/system-settings/integrations/payment-settings-section.tsx` | Form kredensial provider |

Catatan penting dari kode:

- Pada jalur Epay dengan tampilan `TOKENS`, `Amount` disimpan dalam unit USD
  (`tokens / QuotaPerUnit`, dibulatkan ke bawah). Membeli 750.000 kuota hanya
  mengkredit 500.000. **Poketo sebaiknya menyimpan kuota langsung di `Amount`**, seperti
  Creem (`RechargeCreem` memakai `Amount` apa adanya), agar tidak ada pembulatan.
- `TopUp` tidak punya kolom untuk ID invoice Poketo, dan tidak perlu: `GET /v1/invoices/:id`
  menerima `referenceId`, dan kita mengirim `trade_no` sebagai `referenceId`.

## 3. Skema data baru

Ikuti aturan `gateway-aedoxy/AGENTS.md`: GORM, bukan SQL mentah. Harus jalan di SQLite,
MySQL, dan PostgreSQL. Primary key dibuat oleh GORM.

```go
// model/credit_pool.go
type CreditPool struct {
    Id            int   `json:"id"`              // selalu 1
    TotalQuota    int64 `json:"total_quota"`     // total yang pernah dimasukkan admin (neto)
    ReservedQuota int64 `json:"reserved_quota"`  // ditahan order pending
    SoldQuota     int64 `json:"sold_quota"`      // sudah dikreditkan ke user
    UpdatedTime   int64 `json:"updated_time"`
}
// tersedia = TotalQuota - ReservedQuota - SoldQuota (boleh negatif hanya karena pembayaran terlambat)

type CreditPoolLedger struct {
    Id          int    `json:"id"`
    Type        string `json:"type" gorm:"type:varchar(32);index"` // admin_adjust, reserve, release, sell, late_sell, refund_return
    Delta       int64  `json:"delta"`
    TradeNo     string `json:"trade_no" gorm:"type:varchar(255);index"`
    OperatorId  int    `json:"operator_id"`
    Note        string `json:"note" gorm:"type:varchar(255)"`
    CreatedTime int64  `json:"created_time" gorm:"index"`
}
```

Baris `credit_pools` id=1 dibuat saat migrasi bila belum ada (`FirstOrCreate`).
Ledger dipakai untuk audit dan rekonsiliasi dengan laporan Poketo. Ledger tidak dipakai
untuk menghitung saldo pool.

Order Poketo memakai tabel `top_ups` yang ada:

| Kolom | Isi untuk Poketo |
|---|---|
| `trade_no` | `PKT{userId}-{random}-{unix}`, ≤ 64 karakter, hanya `A-Z a-z 0-9 . _ : -` (aturan `referenceId`) |
| `amount` | **Kuota yang akan dikreditkan** (bukan USD) |
| `money` | Nominal Rupiah yang ditagihkan (`amount` di invoice Poketo) |
| `payment_provider` | `poketo` (konstanta baru `PaymentProviderPoketo`) |
| `payment_method` | `qris` saat dibuat, diganti metode aktual dari invoice saat lunas |
| `status` | `pending` → `success` / `expired` / `failed`; tambah `refunded` di `common/constants.go` |

## 4. Alur dan invariant

Semua perubahan pool memakai update bersyarat (`gorm.Expr`) dalam transaksi yang
sama dengan perubahan `top_ups`. Satu `UPDATE ... WHERE` sudah atomik, jadi baris pool
tidak perlu dikunci.

### 4.1 Buat order (`RequestPoketoPay`)

1. Bind `{ amount }` (kuota). Tolak bila `< PoketoMinTopUp`, `<= 0`, atau melewati
   `MaxWalletQuota`. Jalankan `ValidateTopUpQuotaCapacity`.
2. `idr = ceil(amount × PoketoPricePerMillion × rasioGrupTopUp × diskon / 1.000.000)`
   pakai `shopspring/decimal`. Tolak bila `idr < 10.000` atau `idr > 10.000.000`.
3. Transaksi:
   - `UPDATE credit_pools SET reserved_quota = reserved_quota + :q WHERE id = 1 AND total_quota - reserved_quota - sold_quota >= :q`.
     Bila `RowsAffected = 0`, balas "stok kredit habis".
   - Insert `top_ups` (`pending`) + ledger `reserve`.
4. Di luar transaksi: `POST /v1/invoices` dengan `referenceId = trade_no`, header
   `Idempotency-Key = trade_no`, `expiresInMinutes = PoketoInvoiceExpiryMinutes`,
   `redirectUrl = paymentReturnPath("/usage-logs")` (sama dengan Epay; memakai
   `ServerAddress`, yang wajib `https://`),
   `customer.email` dari user bila ada, `metadata.user_id`. Timeout HTTP 10 detik.
5. Bila langkah 4 gagal: transaksi `pending → failed` + lepas reservasi + ledger
   `release`. Bila proses mati di antara langkah 3 dan 4, penyapu yang membereskannya.
6. Balas `{ url: paymentUrl }`. Frontend membuka URL itu, atau memakai pop-up
   `checkout.js` dari Poketo.

### 4.2 Webhook `invoice.paid` (`RechargePoketo`)

1. Ambil invoice terbaru dari `GET /v1/invoices/:referenceId`. Lanjutkan hanya bila
   `status = paid` dan `amount == top_ups.money`.
2. Transaksi dengan `lockForUpdate` pada baris `top_ups`:
   - `payment_provider != poketo` → `ErrPaymentMethodMismatch`.
   - `success` → idempoten, selesai.
   - `pending` → pool: `reserved -= q, sold += q`, ledger `sell`.
   - `expired` / `failed` (bayar terlambat) → pool: `sold += q` tanpa syarat, ledger
     `late_sell`. Bila tersedia < 0, catat peringatan admin.
   - Set `success`, `complete_time`, `payment_method` aktual → `creditTopUpQuota(tx, user, q, nil)`.
3. Di luar TX: `syncCreditUserQuotaCache`, `RecordTopupLog` (pola `RechargeEpay`).

Bila `creditTopUpQuota` gagal karena batas dompet (`ErrTopUpQuotaLimitExceeded`),
transaksi dibatalkan. Uang sudah masuk, jadi balas 2xx, catat error, dan biarkan admin
menyelesaikannya manual. Jangan balas 5xx untuk kasus ini, karena percobaan ulang
akan selalu gagal.

### 4.3 Webhook `invoice.expired` / `invoice.cancelled`

Transaksi: hanya bila `pending` → `expired`, pool `reserved -= q`, ledger `release`.
Pakai pola `UpdatePendingTopUpStatus` yang sudah ada, ditambah update pool.

### 4.4 Webhook `invoice.refunded`

Transaksi: bila `success` → `refunded`. Kurangi kuota user sebesar
`min(q, quota user saat ini)` dengan update bersyarat, lalu pool `sold -= bagian yang
tertarik` dan ledger `refund_return`. Selisih yang tidak tertarik dicatat di log untuk
ditinjau.

### 4.5 Penyapu (goroutine, mis. tiap 5 menit)

Untuk `top_ups` Poketo yang `pending` dan `create_time` sudah lewat masa berlaku + 10 menit:
panggil `GET /v1/invoices/:referenceId`. Bila `paid`, jalankan 4.2. Bila
`expired`/`cancelled`/`not_found`, jalankan 4.3. Batasi jumlah per putaran agar tidak
melewati limit 120 request/menit. Pada deployment multi-node, jalankan hanya di node
master.

### 4.6 Penyelesaian manual admin

Tambahkan cabang `PaymentProviderPoketo` di `ManualCompleteTopUp`: kuota = `Amount`
(bukan `Amount × QuotaPerUnit`), dan pool diubah seperti 4.2.

### Invariant yang harus diuji

- Satu `trade_no` mengkredit kuota paling banyak satu kali, termasuk saat webhook ganda
  atau bersamaan dan saat penyapu berjalan bersamaan dengan webhook.
- `reserved_quota` = jumlah `amount` order Poketo yang `pending`.
- `sold_quota` = jumlah `amount` order Poketo yang `success` dikurangi kuota yang
  ditarik lewat refund.
- Order baru tidak bisa dibuat bila sisa pool kurang dari kuota yang diminta.

## 5. File yang ditambah/diubah

| File | Baru/Ubah | Isi |
|---|---|---|
| `model/credit_pool.go` | Baru | Model, `ReserveCreditPool`, `ReleaseCreditPool`, `AdjustCreditPool`, `GetCreditPool` |
| `model/topup.go` | Ubah | Konstanta `PaymentProviderPoketo`, `RechargePoketo`, cabang Poketo di `ManualCompleteTopUp` |
| `model/main.go` | Ubah | `AutoMigrate(&CreditPool{}, &CreditPoolLedger{})` + seed baris id=1 |
| `common/constants.go` | Ubah | `TopUpStatusRefunded = "refunded"` |
| `service/poketo.go` | Baru | Klien HTTP Poketo (create/get/cancel invoice) dan `VerifyPoketoSignature` |
| `controller/topup_poketo.go` | Baru | `RequestPoketoPay`, `RequestPoketoAmount` (pratinjau harga), `PoketoWebhook` |
| `controller/credit_pool.go` | Baru | Endpoint admin dan publik untuk pool |
| `controller/payment_webhook_availability.go` | Ubah | `isPoketoTopUpEnabled()` |
| `controller/topup.go` | Ubah | `GetTopUpInfo`: tambah metode Poketo, `enable_poketo_topup`, `poketo_min_topup`, sisa pool |
| `router/api-router.go` | Ubah | Route (lihat di bawah) |
| `model/option.go` + `setting/` | Ubah | Option Poketo (lihat `INTEGRASI-POKETO.md` bagian 2) |
| `main.go` | Ubah | `go model.SweepPoketoTopUps(...)` |
| `web/src/features/wallet/...` | Ubah | Tombol Poketo, tampilan sisa pool |
| `web/src/features/system-settings/integrations/...` | Ubah | Form setting Poketo + panel pool |
| `web/src/i18n/locales/*.json` | Ubah | Teks baru di ketujuh file locale |
| Satu file test (mis. `model/credit_pool_test.go`) | Baru | Invariant di bagian 4 (testify `require`/`assert`) |

Route:

```go
apiRouter.POST("/poketo/webhook", anonymousRequestBodyLimit, controller.PoketoWebhook)
apiRouter.GET("/credit-pool/public", controller.GetCreditPoolPublic)   // hanya angka tersedia
selfRoute.POST("/poketo/pay", middleware.CriticalRateLimit(), controller.RequestPoketoPay)
selfRoute.POST("/poketo/amount", controller.RequestPoketoAmount)
// grup admin baru dengan middleware.RootAuth():
//   GET  /api/credit-pool          → total, reserved, sold, tersedia
//   POST /api/credit-pool/adjust   → { delta, note } + ledger admin_adjust
//   GET  /api/credit-pool/ledger   → riwayat
```

## 6. Dependensi

Tidak ada dependensi Go baru. Semua sudah ada di stdlib atau `go.mod`:

| Kebutuhan | Paket |
|---|---|
| HTTP ke Poketo | `net/http` (client dengan `Timeout`) |
| Verifikasi webhook | `crypto/hmac`, `crypto/sha256`, `encoding/hex`, `strconv`, `strings` |
| Hitung uang/kuota | `github.com/shopspring/decimal` (sudah dipakai) |
| JSON | `common.Marshal` / `common.Unmarshal` (wajib menurut `AGENTS.md`, bukan `encoding/json`) |
| DB, lock | GORM + `lockForUpdate(tx)` (sudah ada) |
| Frontend | Tidak ada paket baru. `checkout.js` Poketo dimuat dari `https://poketo.id/js/checkout.js` hanya bila ingin pop-up |

SDK resmi Poketo (`poketo-node`) hanya untuk Node.js, jadi tidak dipakai di backend Go.

Kebutuhan infrastruktur:

- Domain HTTPS publik yang bisa dijangkau Poketo (webhook wajib `https://`, dan alamat
  jaringan privat ditolak). Caddy di `docker-compose.yml` sudah menangani TLS.
- Jam server yang akurat (NTP), karena tanda tangan webhook ditolak bila selisih > 5 menit.
- Backup database sebelum migrasi tabel baru.

## 7. Verifikasi yang diwajibkan `AGENTS.md`

- Migrasi dan transaksi harus diuji pada SQLite, MySQL, dan PostgreSQL sungguhan,
  pada DB baru dan DB hasil versi rilis terakhir, dengan startup dua kali.
- Billing gate: perubahan ini tidak mengubah penetapan harga model. Namun `creditTopUpQuota`
  dan aturan kuota tetap disentuh, jadi baca `.agents/rules/billing.md` sebelum mulai
  menulis kode.
- Format kode dengan `gofmt`. Frontend memakai `bun`.
