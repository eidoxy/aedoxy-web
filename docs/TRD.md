# TRD: Aedoxy, Platform Langganan Kredit API

| | |
|---|---|
| Versi | 0.2 (draf) |
| Tanggal | 2026-11-01 |
| Basis kode yang diperiksa | `gateway-aedoxy` branch `develop`, commit `fcb3f363b` |
| Menggantikan | Rancangan provider Poketo native di `topup-pool-poketo/` (lihat D1) |
| Perubahan dari 0.1 | Hanya langganan berharga flat. Top up dompet dihapus. Kurs hanya untuk tampilan. Bridge `fulfill` hanya untuk subscription |

## 1. Arsitektur

```
                         Internet (HTTPS, Caddy)
        ┌──────────────────────────┴───────────────────────────┐
        │ aedoxy.com                                           │ ai.aedoxy.com
        ▼                                                      ▼
 ┌───────────────────────────┐   OIDC (login Aedoxy)   ┌──────────────────────────┐
 │ aedoxy-web (Next.js)      │◀────────────────────────│ new-api (gateway-aedoxy) │
 │ - landing, panel, admin   │                         │ - console, API key, log  │
 │ - Better Auth + OIDC IdP  │  HTTP internal (Docker) │ - relay + potong kredit  │
 │ - paket, order, pool,     │────────────────────────▶│   paket                  │
 │   diskon, kurs tampilan   │  /api/aedoxy/* (bridge) │ - subscription & expiry  │
 │ - webhook Poketo          │  + endpoint admin lama  │                          │
 └──────────┬────────────────┘                         └────────────┬─────────────┘
            │                                                        │
 ┌──────────▼────────────────┐                          ┌────────────▼─────────────┐
 │ aedoxy-worker (Node)      │                          │ Postgres DB "new-api"    │
 │ - outbox aktivasi paket   │                          │ Redis                    │
 │ - sapu order kedaluwarsa  │                          └──────────────────────────┘
 │ - kurs tampilan berkala   │
 │ - rekonsiliasi paket      │        ┌───────────────┐
 └──────────┬────────────────┘        │ Poketo API    │◀── invoice, cek status
            ▼                         │ + webhook     │──▶ POST aedoxy.com/api/webhooks/poketo
 ┌───────────────────────────┐        └───────────────┘
 │ Postgres DB "aedoxy"      │        ┌───────────────┐
 │ (server yang sama, DB dan │        │ Frankfurter / │◀── kurs USD→IDR (tampilan)
 │  user DB terpisah)        │        │ open.er-api   │
 └───────────────────────────┘        └───────────────┘
```

## 2. Keputusan utama

| ID | Keputusan | Alternatif yang ditolak, dan alasannya |
|---|---|---|
| D1 | **aedoxy.com memegang commerce**: katalog paket, harga flat, diskon, order, pembayaran, pool, kurs tampilan, dan feed. **New API memegang kredit dan pemakaian**: subscription aktif, pemotongan kredit, dan expiry. | Provider Poketo di dalam fork Go (rancangan sebelumnya). Ditolak karena panel dan admin sekarang dibangun terpisah di Next.js. |
| D2 | **Satu-satunya produk adalah paket subscription bawaan New API.** `SubscriptionPlan` sudah punya durasi `hour/day/month/year/custom`, `TotalAmount`, `AllowWalletOverflow`, `UpgradeGroup`, `MaxPurchasePerUser`, dan job `ExpireDueSubscriptions`. Next.js menyimpan harga flat rupiah dan diskon, lalu memetakan setiap paket ke `newapi_plan_id`. Saldo dompet New API tidak diisi. | (a) Top up per dolar (pay as you go). Ditolak sesuai keputusan pemilik produk. (b) Ember kredit berjangka buatan sendiri. Ditolak karena kredit dipotong di relay New API, sehingga Next.js tidak bisa menegakkan "hangus" tanpa mengubah jalur relay. |
| D3 | **aedoxy.com menjadi identity provider (OIDC)** lewat plugin [OAuth 2.1 Provider Better Auth](https://better-auth.com/docs/plugins/oauth-provider) dengan scope `openid`. New API memakai fitur Custom OAuth Provider (`model/custom_oauth_provider.go`, mendukung discovery `well_known`) sebagai satu-satunya cara login user. | (a) Login Google terpisah di kedua aplikasi. Ditolak karena user harus login dua kali, berisiko punya akun ganda, dan tidak mendukung email/password. (b) Next.js login dengan password New API. Ditolak karena password akan melewati aplikasi kedua. |
| D4 | **Tambahan kecil di fork Go ("bridge")**: dua endpoint, yaitu `accounts/ensure` dan `fulfill` yang idempoten berdasarkan `trade_no`. Detailnya di bagian 7. | Hanya memakai `POST /api/subscription/admin/bind`. Ditolak karena endpoint ini **tidak idempoten** (retry setelah timeout memberi paket dua kali) dan tidak mengembalikan ID subscription. Selain itu, New API tidak menyediakan pencarian user berdasarkan `sub` OAuth. |
| D5 | **Pool di DB aedoxy** dalam satuan kuota New API (`quota_per_unit`, default 500.000 = $1). Kredit paket direservasi saat order dibuat, dipindah ke terjual saat lunas, dan dilepas saat order kedaluwarsa. Sisa kredit dikembalikan ke pool setelah paket hangus. | Pool di New API. Ditolak karena keputusan menjual atau tidak menjual ada di sisi commerce. |
| D6 | **Paket diaktifkan lewat outbox + worker.** Webhook hanya mencatat status lunas dan membuat baris `fulfillments` dalam satu transaksi. Worker memanggil bridge dengan retry. | Memanggil New API langsung di dalam webhook. Ditolak karena Poketo menunggu balasan maksimal 10 detik, dan jika console sedang down paket akan hilang tanpa jejak. |
| D7 | **Kurs hanya untuk tampilan.** Kurs disimpan di aedoxy (mode manual atau otomatis; sumber Frankfurter/ECB, cadangan open.er-api) dan hanya dipakai untuk keterangan "≈ Rp" di panel dan katalog. Nominal pembayaran selalu harga flat paket. | Menghitung harga dari kurs. Ditolak karena harga ditetapkan flat oleh admin. |
| D8 | **Satu server Postgres, dua database** (`new-api` dan `aedoxy`) dengan user DB terpisah. Next.js tidak pernah membaca atau menulis tabel New API secara langsung. | Satu database bersama. Ditolak karena Next.js akan terikat skema upstream dan melewati cache Redis New API. |
| D9 | **Tanpa antrean eksternal.** Worker memakai tabel Postgres dengan `FOR UPDATE SKIP LOCKED` dan interval timer. | BullMQ atau pg-boss. Belum perlu untuk volume awal. |

## 3. Sumber kebenaran

| Data | Pemilik | Pihak lain membaca lewat |
|---|---|---|
| Akun, profil, 2FA, peran admin | aedoxy (Better Auth) | New API: klaim OIDC saat login |
| `newapi_user_id` milik akun | aedoxy (diisi dari `accounts/ensure`) | – |
| Subscription aktif, sisa kredit, waktu habis | New API | aedoxy: `GET /api/subscription/admin/users/:id/subscriptions` |
| API key, log pemakaian | New API | – |
| Definisi paket (kredit, durasi, grup) | aedoxy, lalu disinkronkan ke New API | New API: `SubscriptionPlan` |
| Harga flat, diskon, promo, pool, order, kurs tampilan | aedoxy | – |
| Status pembayaran | Poketo | aedoxy: webhook + `GET /v1/invoices/:id` |

## 4. Tech stack dan dependensi

| Kebutuhan | Pilihan | Catatan |
|---|---|---|
| Framework | Next.js (App Router), TypeScript `strict` | Gunakan versi stabil terbaru saat proyek dimulai. Route Handler untuk webhook dan API, Server Actions untuk form |
| Runtime | Node.js 24 LTS | Sudah terpasang (v24.18.0) |
| Package manager | Bun | Konsisten dengan `gateway-aedoxy/web` |
| UI | Tailwind CSS 4, shadcn/ui, lucide-react, `@lobehub/icons` (logo provider) | Stack yang sama dengan `gateway-aedoxy/web`. Chart pakai komponen chart shadcn (Recharts) |
| Form dan validasi | react-hook-form, Zod | Zod juga untuk validasi env dan payload eksternal |
| Data client | TanStack Query | Polling status order dan feed aktivitas |
| Database | PostgreSQL 15 (sudah ada di compose), Drizzle ORM + drizzle-kit | Transaksi dan `UPDATE ... WHERE` bersyarat mudah ditulis. Alternatifnya Prisma |
| Auth | Better Auth: email/password + verifikasi email, Google, plugin `twoFactor`, `admin`, OAuth 2.1 Provider | Admin wajib 2FA |
| Email | Penyedia transaksional (Resend atau SMTP) | Verifikasi email dan reset password. Bukti bayar dikirim oleh Poketo |
| Pembayaran | Klien tipis sendiri (`fetch` + `node:crypto`), tanpa paket baru | Dokumentasi Poketo menyebut SDK `poketo-node`, tetapi paket itu **tidak ada di registry npm** (dicek 2026-11-02; paket `poketo` di npm adalah pustaka manga yang tidak terkait, jangan dipasang). Klien sendiri mengurus `Idempotency-Key`, retry 429/5xx, dan verifikasi tanda tangan |
| Kurs tampilan | `fetch` ke Frankfurter dan open.er-api | Tanpa API key |
| Log | pino (JSON) | Opsional: Sentry untuk error |
| Test | Vitest (unit dan integrasi dengan Postgres asli), Playwright (e2e sandbox) | |

Tidak ada dependensi Go baru di fork.

## 5. Struktur proyek Next.js

```
aedoxy-web/
  src/
    app/
      (marketing)/          page.tsx, models/, pricing/, docs/, terms/, privacy/, refund/
      (auth)/               login/, register/, verify-email/, forgot-password/
      (panel)/              dashboard/, plans/, orders/[id]/, settings/
      admin/                pool/, orders/, plans/, promos/, fx/, users/, activity/, audit/
      api/
        auth/[...all]/route.ts         Better Auth + OIDC provider
        webhooks/poketo/route.ts       webhook (runtime nodejs)
        public/activity/route.ts       feed (cache 30 dtk)
        public/pool-status/route.ts    status stok (cache 60 dtk)
    server/
      db/schema.ts, db/client.ts
      domain/pricing.ts     harga flat − diskon, batas nominal (fungsi murni + unit test)
      domain/pool.ts        reserve / sell / release / return
      domain/orders.ts      state machine order
      domain/fx.ts          konversi tampilan $ → Rp
      integrations/newapi.ts   klien bridge + endpoint admin
      integrations/poketo.ts   klien tipis Poketo (fetch) + verifikasi tanda tangan
      integrations/fx.ts       sumber kurs
      env.ts                validasi env dengan Zod (aplikasi gagal start bila kosong)
    worker/index.ts         loop outbox, sapu, kurs, rekonsiliasi
  drizzle/                  migrasi
```

## 6. Model data (DB `aedoxy`)

Uang dalam rupiah disimpan sebagai `bigint` rupiah utuh. Kredit disimpan sebagai `bigint` dalam satuan kuota New API. Nilai $ hanya untuk tampilan (`quota / quota_per_unit`).

| Tabel | Kolom penting |
|---|---|
| `user`, `session`, `account`, `verification`, `twoFactor`, tabel OAuth provider | Dibuat oleh Better Auth. Ditambah kolom `user.newapi_user_id` (int, unik, nullable), `user.role`, `user.feed_visibility` (`masked`/`hidden`) |
| `credit_pool` | Satu baris: `total_quota`, `reserved_quota`, `sold_quota`, `low_threshold_quota`, `updated_at` |
| `pool_ledger` | `type` (`admin_adjust`, `reserve`, `release`, `sell`, `late_sell`, `expire_return`, `replace_return`, `refund_return`), `delta`, `order_id`, `actor_id`, `note`, `created_at` |
| `plans` | `name`, `slug`, `period` (`weekly`/`monthly`/`custom`), `duration_unit` (`hour`/`day`), `duration_value`, `credit_quota`, `price_idr`, `compare_at_price_idr` (harga coret, nullable), `fair_use` bool, `upgrade_group`, `max_purchase_per_user`, `stock_limit`, `sold_count`, `sale_starts_at`, `sale_ends_at`, `badge`, `enabled`, `sort_order`, `newapi_plan_id`, `synced_at` |
| `promotions` | `name`, `code` (unik, nullable, case-insensitive), `kind` (`percent`/`fixed`), `value`, `plan_ids` int[] (kosong = semua paket), `starts_at`, `ends_at`, `max_redemptions`, `redeemed_count`, `per_user_limit`, `enabled` |
| `promotion_redemptions` | `promotion_id`, `order_id` (unik), `user_id`, `status` (`reserved`/`used`/`released`) |
| `orders` | `id`, `trade_no` (unik, ≤ 64, `[A-Za-z0-9._:-]`), `user_id`, `plan_id`, `plan_snapshot` jsonb (nama, kredit, durasi saat dibeli), `credit_quota`, `list_price_idr`, `discount_idr`, `amount_idr`, `promotion_id`, `status`, `poketo_invoice_id`, `payment_url`, `payment_method`, `expires_at`, `paid_at`, `created_at` |
| `fulfillments` | `order_id` (unik), `status` (`queued`/`retrying`/`succeeded`/`dead`), `attempts`, `next_attempt_at`, `last_error`, `newapi_ref` (jsonb: `user_subscription_id`, `end_time`) |
| `subscription_grants` | `order_id` (unik), `newapi_user_id`, `newapi_user_subscription_id`, `credit_quota`, `ends_at`, `returned_quota`, `reconciled_at` |
| `fx_settings` | Satu baris: `mode` (`manual`/`auto`), `manual_rate_idr`, `rounding_step_idr`, `refresh_hours`, `stale_after_hours`, `divergence_alert_pct`, `show_conversion` bool |
| `fx_rates` | `source`, `mid_rate` numeric(14,4), `source_date`, `fetched_at`, `applied` bool |
| `webhook_events` | `event_id` (unik), `event_type`, `delivery_id`, `received_at`, `processed_at`, `result` |
| `admin_audit_log` | `actor_id`, `action`, `target`, `before` jsonb, `after` jsonb, `ip`, `created_at` |
| `model_meta` | `model_name` (unik), `provider`, `context_in`, `context_out`, `capabilities` text[], `official_input_usd_per_m`, `official_output_usd_per_m`, `visible`. Metadata katalog yang tidak disimpan New API (F08) |

Indeks wajib: `orders(user_id, status)`, `orders(status, expires_at)`, `fulfillments(status, next_attempt_at)`, `subscription_grants(reconciled_at, ends_at)`.

Order tidak menyimpan kurs, karena kurs tidak memengaruhi nominal pembayaran.

## 7. Integrasi New API

### 7.1 Bridge di fork `gateway-aedoxy` (kode baru)

Semua endpoint berada di bawah `/api/aedoxy` dan memakai `middleware.AdminAuth()` + access token `nap_` milik akun layanan khusus (`aedoxy-bridge`). Akun ini hanya punya scope `user:read`, `user:write`, `billing:read`, `billing:write`. Endpoint bridge diblokir dari internet oleh Caddy, dan Next.js memanggilnya lewat jaringan Docker (`http://new-api:3000`).

**`POST /api/aedoxy/accounts/ensure`** (scope `user:write`)

```json
// request
{ "subject": "usr_8f2c...", "email": "rina@example.com", "display_name": "Rina" }
// response
{ "user_id": 123, "username": "aedoxy_123", "created": true }
```

1. Ambil custom OAuth provider dengan slug `aedoxy`.
2. `GetUserByOAuthBinding(providerId, subject)`. Jika ada, kembalikan user tersebut.
3. Jika belum ada: dalam satu transaksi, buat user (pola yang sama dengan `findOrCreateOAuthUser`: username = prefix provider + ID, password acak, grup default, kuota 0) lalu `CreateUserOAuthBindingWithTx`.
4. Jika dua request datang bersamaan, unique index `ux_provider_userid` menolak yang kedua. Tangani dengan membaca ulang binding, lalu kembalikan `created: false`.

**`POST /api/aedoxy/fulfill`** (scope `billing:write`)

```json
// request
{ "trade_no": "ADX-20261101-7Q3K9M", "user_id": 123, "plan_id": 7,
  "money_idr": 40000, "payment_method": "QRIS" }
// response
{ "already_fulfilled": false, "user_subscription_id": 456, "end_time": 1793580000,
  "replaced": [{ "id": 401, "remaining": 1250000 }] }
```

**Satu paket aktif per user.** Bila user masih punya subscription aktif, `fulfill` membatalkannya dalam transaksi yang sama (status `cancelled`, `end_time = now`, grup diturunkan), lalu membuat subscription baru. Sisa kredit paket lama dikembalikan di `replaced`, dan aedoxy mengembalikannya ke pool (ledger `replace_return`).

1. Insert `SubscriptionOrder{TradeNo, UserId, PlanId, Money: money_idr, PaymentProvider: "aedoxy", PaymentMethod, Status: pending}` bila belum ada (`trade_no` unik).
2. Dalam transaksi: kunci baris order. Jika sudah `success`, kembalikan `ProviderPayload` yang tersimpan sebagai `already_fulfilled`. Jika `user_id` atau provider berbeda, kembalikan 409.
3. Jika belum: kunci baris user, batalkan subscription aktif lama (catat sisanya), `CreateUserSubscriptionFromPlanTx(tx, userId, plan, "order")`, `upsertSubscriptionTopUpTx`, ubah status menjadi `success`, lalu simpan seluruh hasil di `ProviderPayload` agar retry mengembalikan jawaban yang sama.
4. Setelah commit: refresh cache grup bila grup berubah, lalu `RecordLog` (pola `CompleteSubscriptionOrder`).
5. Validasi: `trade_no` sesuai pola, `plan_id` ada, `user_id` ada. Bridge sengaja tidak memanggil `CompleteSubscriptionOrder`, karena fungsi itu tidak mengembalikan ID subscription.

File yang disentuh di fork:

| File | Perubahan |
|---|---|
| `model/aedoxy_bridge.go` | Baru: `EnsureAedoxyUser`, `FulfillAedoxySubscription`, konstanta `PaymentProviderAedoxy = "aedoxy"` |
| `controller/aedoxy_bridge.go` | Baru: handler, validasi, JSON lewat `common.*` |
| `router/api-router.go` | Tambah 2 route dalam grup `AdminAuth` |
| `middleware/access_token_routes.go` | Tambah 2 aturan scope |
| `model/aedoxy_bridge_test.go` | Baru: idempotensi, race, user/paket tidak ada |

Sesuai `gateway-aedoxy/AGENTS.md`: transaksi ini wajib diuji di SQLite, MySQL, dan PostgreSQL sungguhan, dan kode diformat dengan `gofmt`. Bridge tidak lagi menambah kuota dompet, jadi tidak ada konversi kuota baru di sisi Go.

### 7.2 Endpoint New API yang sudah ada dan dipakai

| Endpoint | Scope | Dipakai untuk |
|---|---|---|
| `GET /api/status` | publik | `quota_per_unit`, info sistem |
| `GET /api/pricing` | tergantung pengaturan modul nav | Katalog model (F08) |
| `GET /api/subscription/admin/users/:id/subscriptions` | `billing:read` | Paket aktif dan sisa kredit di panel, rekonsiliasi sisa kredit |
| `GET/POST/PUT/PATCH /api/subscription/admin/plans` | `billing:read/write` | Sinkronisasi paket (F05) |
| `POST /api/subscription/admin/user_subscriptions/:id/invalidate` | `billing:write` | Refund manual |

### 7.3 Pengaturan New API yang wajib

- Custom OAuth provider: nama "Aedoxy", slug `aedoxy`, discovery ke aedoxy.com, `UserIdField = sub`.
- Matikan pendaftaran password (`PasswordRegisterEnabled`) dan semua provider login lain. Biarkan `RegisterEnabled` aktif, agar user yang login dengan Aedoxy sebelum `ensure` dipanggil tetap dibuatkan akun oleh New API dengan binding yang sama. Setelah masa transisi akun lama, matikan login password untuk user biasa. Pertahankan login root dengan 2FA.
- Matikan semua sumber kredit di luar pool: kuota user baru = 0, bonus undangan = 0, check-in mati, jangan menjual kode redeem, dan biarkan semua provider top up New API kosong. Kredit yang masuk lewat jalur ini tidak mengurangi pool.
- `TopUpLink` = `https://aedoxy.com/plans`.
- Paket hasil sinkronisasi: `AllowBalancePay = false` dan `AllowWalletOverflow = false`. Dengan pengaturan ini, pemakaian hanya memotong kredit paket, dan request ditolak saat kredit paket habis. User baru juga punya saldo dompet 0, sehingga preferensi billing default New API (`subscription_first`) secara praktis berperilaku seperti `subscription_only`.
- `ServerAddress = https://ai.aedoxy.com`. Tampilan kuota dalam USD.

## 8. Integrasi Poketo

Detail kredensial, verifikasi tanda tangan, kode respons, biaya, dan skenario sandbox ada di `topup-pool-poketo/INTEGRASI-POKETO.md` dan masih berlaku, dengan perubahan berikut:

- URL webhook menjadi `https://aedoxy.com/api/webhooks/poketo`.
- Verifikasi memakai fungsi sendiri `verifyPoketoSignature(rawBody, signatureHeader, whsecSecret, now)`: HMAC-SHA256 atas `"<t>.<rawBody>"`, perbandingan waktu-konstan (`crypto.timingSafeEqual`), tolak `t` lebih tua dari 5 menit. Body dibaca mentah dengan `await request.text()` sebelum di-parse.
- Yang ditagih adalah harga flat paket, bukan nominal kuota. Abaikan bagian "harga per juta kuota" di dokumen itu.

Saat membuat invoice: `amount = amount_idr`, `items = [{ name: nama paket, quantity: 1, price: amount_idr }]`, `referenceId = trade_no`, `Idempotency-Key = trade_no`, `expiresInMinutes = 15`, `redirectUrl = https://aedoxy.com/orders/<id>`, `customer.email` dari akun, dan `metadata.order_id`.

## 9. Alur dan state machine

### 9.1 Order

```
            buat order (reserve pool, stok paket, promo)
                         │
                         ▼
   ┌──────────────── pending ─────────────────┐
   │ gagal buat invoice   │ webhook paid       │ expired / cancelled / sapu
   ▼                      ▼                    ▼
 failed                  paid ◀──── bayar terlambat ──── expired / cancelled
 (lepas reservasi)        │                    (lepas reservasi saat expire;
                          │                     saat paid terlambat: late_sell)
                          ▼
                   fulfillments: queued → retrying → succeeded | dead (alert)
                          │
                          └─ invoice.refunded → refunded (tindakan admin manual)
```

### 9.2 Buat order (satu transaksi DB)

1. Validasi: akun terverifikasi, `newapi_user_id` ada (panggil `accounts/ensure` bila kosong), paket aktif, tersinkron, dan dalam periode jual, jumlah order pending user < batas, dan batas pembelian paket. Bila user punya paket aktif, request wajib membawa `replaceConfirmed = true` (user sudah melihat peringatan bahwa paket lama digantikan dan sisa kreditnya hangus).
2. Hitung harga di `domain/pricing.ts`: `price_idr` paket dikurangi diskon promo, minimal Rp10.000. Kurs tidak dipakai.
3. `UPDATE credit_pool SET reserved_quota = reserved_quota + :q WHERE id = 1 AND total_quota - reserved_quota - sold_quota >= :q` dengan `q = credit_quota` paket. Jika 0 baris berubah, stok habis.
4. Stok paket dan kuota promo memakai update bersyarat yang sama (`sold_count < stock_limit`, `redeemed_count < max_redemptions`).
5. Insert order `pending` (dengan `plan_snapshot`), ledger `reserve`, dan `promotion_redemptions` `reserved`.
6. Di luar transaksi: buat invoice Poketo. Jika gagal, order menjadi `failed` dan semua reservasi dilepas dalam transaksi kedua.

### 9.3 Webhook Poketo

1. Verifikasi tanda tangan dan umur timestamp (≤ 5 menit). Jika gagal, balas 401.
2. `INSERT webhook_events ON CONFLICT (event_id) DO NOTHING`. Event yang sudah diproses dibalas 200.
3. `GET /v1/invoices/:referenceId`. Status dan nominal dari respons ini yang dipakai, dan nominal harus sama dengan `amount_idr`.
4. Untuk `paid` dalam satu transaksi: kunci order (`FOR UPDATE`).
   - Status `pending`: pool `reserved −= q, sold += q`, ledger `sell`, promo `used`, order `paid`, insert `fulfillments(queued)`.
   - Status `expired`/`cancelled`: pool `sold += q` tanpa syarat, ledger `late_sell`, dan alert admin bila pool negatif.
   - Sudah `paid`: tidak melakukan apa-apa.
5. `expired`/`cancelled` dari `pending`: lepas reservasi pool, stok paket, dan promo.
6. Balas 200. Error DB atau error Poketo dibalas 500 agar Poketo mengulang.

### 9.4 Rekonsiliasi paket (pengembalian sisa kredit ke pool)

Setelah `ends_at` lewat, worker membaca subscription dari New API. `sisa = max(0, amount_total − amount_used)`. Untuk paket fair use, `amount_total` adalah batas fair use. Lalu dalam satu transaksi: pool `sold −= sisa`, ledger `expire_return`, dan `reconciled_at = now`. Versi 1 hanya mendukung paket dengan `quota_reset_period = never`, karena reset periodik membuat `amount_used` tidak lagi mencerminkan total pemakaian.

Paket yang digantikan sebelum masa aktifnya habis tidak menunggu job ini: worker outbox langsung memproses `replaced` dari respons `fulfill` (pool `sold −= remaining`, ledger `replace_return`, `subscription_grants.reconciled_at = now` untuk grant lama). Sisa ini tercatat sedikit lebih besar bila masih ada request yang sedang berjalan di paket lama saat diganti.

## 10. Background job (`aedoxy-worker`)

| Job | Interval | Isi |
|---|---|---|
| Outbox aktivasi paket | 5 detik | Ambil `fulfillments` `queued/retrying` dengan `next_attempt_at <= now` memakai `FOR UPDATE SKIP LOCKED`, panggil `fulfill`. Backoff 10 dtk, 30 dtk, 2 mnt, 10 mnt, 1 jam. Setelah 10 kali gagal: `dead` + alert |
| Sapu order | 5 menit | Order `pending` yang lewat `expires_at` + 10 mnt: cek `GET /v1/invoices/:id`. Lunas → proses seperti webhook. Lainnya → `expired` + lepas reservasi |
| Kurs tampilan | `refresh_hours` | Ambil dua sumber dan simpan kurs berlaku (F04) |
| Rekonsiliasi paket | 15 menit | Bagian 9.4 |
| Sinkronisasi paket | Saat admin menyimpan + 1 jam | Pastikan `plans` sama dengan `SubscriptionPlan` di New API |
| Invariant pool | 1 jam | `reserved_quota` = Σ kredit order `pending`. Bila berbeda, kirim alert, dan jangan memperbaiki otomatis |
| Rekonsiliasi Poketo | Harian | `GET /v1/invoices?status=paid&createdFrom=` dibandingkan dengan order `paid`. Selisih → alert |

Hanya satu instance worker yang berjalan. `SKIP LOCKED` tetap aman jika nanti ditambah.

## 11. Keamanan

- **Secret** hanya di environment variable server: `POKETO_SECRET_KEY`, `POKETO_WEBHOOK_SECRET`, `NEWAPI_BRIDGE_TOKEN`, `BETTER_AUTH_SECRET`, `DATABASE_URL`, dan kunci OAuth. `env.ts` menolak start bila ada yang kosong. Ini mencegah kelas bug CVE-2026-41432 (webhook dengan secret kosong).
- **Webhook**: verifikasi HMAC atas body mentah, tolak timestamp lama, konfirmasi ke API Poketo, cocokkan nominal dengan order.
- **Admin**: peran `admin` + 2FA wajib. Re-autentikasi untuk mengubah pool, harga, dan diskon. Semua perubahan masuk `admin_audit_log`.
- **Bridge**: token dengan scope minimum, endpoint diblokir di Caddy, dan dipanggil lewat jaringan internal. Token access New API punya masa berlaku (default 30 hari, `AccessTokenDefaultExpiryDays`), jadi siapkan rotasi dan alert sebelum kedaluwarsa.
- **Abuse**: rate limit untuk pembuatan order dan endpoint auth, batas order pending per user, verifikasi email sebelum membeli.
- **OIDC provider**: PKCE, redirect URI persis (hanya callback ai.aedoxy.com), masa berlaku token singkat. Ikuti panduan keamanan Better Auth dan OWASP ASVS untuk alur auth.
- **Header**: CSP, `X-Frame-Options` (kecuali bila checkout.js Poketo membutuhkan pengecualian), HSTS dari Caddy.
- **Infrastruktur**: ganti password default `123456` Postgres dan Redis di `gateway-aedoxy/docker-compose.yml`. Pakai user DB `aedoxy` yang hanya punya akses ke database `aedoxy`.

## 12. Deployment

Tambahkan dua service ke compose yang sudah ada (image yang sama, command berbeda):

| Service | Command | Catatan |
|---|---|---|
| `aedoxy-web` | `node server.js` (output `standalone`) | Port 3000 internal |
| `aedoxy-worker` | `node dist/worker.js` | Tanpa port |

Caddy:

```
aedoxy.com {
    reverse_proxy aedoxy-web:3000
}
ai.aedoxy.com {
    @bridge path /api/aedoxy/*
    respond @bridge 404
    reverse_proxy new-api:3000 { flush_interval -1 }
}
```

`Caddyfile` saat ini masih memakai `ai.obersa.my.id`. Ganti domainnya ke `ai.aedoxy.com`. Domain lama tidak punya user, jadi tidak perlu masa transisi.

**Target: satu VPS NAT bersama New API.** `aedoxy-web`, `aedoxy-worker`, `new-api`, Postgres, dan Redis berada di network Docker `new-api-network` yang sama, sehingga bridge dipanggil lewat `http://new-api:3000` tanpa keluar ke internet. Hal yang perlu dicek di VPS NAT:
- Port 80/443 publik harus di-forward ke Caddy. Poketo wajib bisa menjangkau `https://aedoxy.com/api/webhooks/poketo` tanpa redirect, dan Let's Encrypt butuh port 80 atau 443 untuk sertifikat. Bila provider NAT hanya memberi port tinggi, pakai Cloudflare Tunnel atau DNS challenge.
- RAM: Next.js standalone sekitar 150–250 MB, worker sekitar 100 MB. Build image dilakukan di CI (workflow `deploy.yml` yang sudah ada), bukan di VPS.

Environment variable `aedoxy-web` dan `aedoxy-worker`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `EMAIL_*`, `POKETO_SECRET_KEY`, `POKETO_WEBHOOK_SECRET`, `NEWAPI_INTERNAL_URL=http://new-api:3000`, `NEWAPI_BRIDGE_TOKEN`, `NEWAPI_PUBLIC_URL=https://ai.aedoxy.com`, `ALERT_WEBHOOK_URL` (opsional).

## 13. Observability dan alert

Alert dikirim ke email admin atau webhook (Telegram/Discord) untuk: aktivasi paket `dead`, pool tersedia < ambang atau negatif, invariant pool tidak cocok, sumber kurs basi atau berbeda > 2%, paket gagal sinkron, selisih rekonsiliasi Poketo, dan token bridge hampir kedaluwarsa.

## 14. Pengujian

| Lapisan | Yang diuji |
|---|---|
| Unit (Vitest) | `pricing.ts`: diskon, pemilihan promo, batas nominal. `fx.ts`: pembulatan konversi tampilan. `pool.ts`: transisi status |
| Integrasi (Postgres asli) | Reservasi bersamaan (100 order paralel, stok cukup untuk 10 paket → tepat 10 berhasil), webhook ganda, bayar terlambat, promo dan stok paket dengan kuota bersamaan |
| Kontrak bridge (Go) | Idempotensi `fulfill`, race `ensure`, di tiga database |
| E2E (Playwright + Poketo sandbox) | Daftar → beli paket → simulate `paid` → paket aktif di console → pakai API → kredit paket berkurang |
| Manual sebelum go-live | Satu transaksi live Rp10.000. Cek Poketo, order, ledger, dan paket di console |

## 15. Hal yang belum diverifikasi

1. Path endpoint dan format klaim plugin OAuth 2.1 Provider Better Auth, serta kecocokannya dengan pemetaan field Custom OAuth New API. Uji dengan discovery `well_known`.
2. Bentuk persis body webhook Poketo. Rancangan sengaja memakai `GET /v1/invoices/:id` sebagai sumber kebenaran, jadi ambil contoh body dari sandbox lebih dulu.
3. Apakah `GET /api/pricing` bisa diakses tanpa login di pengaturan Anda.
4. Masa berlaku maksimum access token New API, dan apakah token bisa dibuat tanpa kedaluwarsa.
5. Perilaku `amount_used` untuk paket dengan `TotalAmount = 0`. Rancangan menghindarinya dengan selalu memberi batas fair use.

Sudah terverifikasi: tanpa paket aktif dan dengan saldo dompet 0, New API menolak request (`service/billing_session.go`: `subscription_first` → `tryWallet` → `ErrorCodeInsufficientUserQuota`, dikonfirmasi pemilik di ai.aedoxy.com).
