# Dokumentasi Aedoxy

Sistem langganan kredit API untuk ai.aedoxy.com (console New API) lewat aedoxy.com (Next.js). Disusun 2026-11-01, direvisi ke versi 0.2 pada hari yang sama.

## Urutan baca

1. `PRD.md`: apa yang dibangun dan untuk siapa, prioritas, dan keputusan bisnis yang masih terbuka (bagian 11).
2. `TRD.md`: arsitektur, keputusan teknis, model data, bridge New API, alur pembayaran, keamanan, deployment.
3. `features/`: planning per fitur, berisi tugas, ukuran, dan kriteria selesai.
4. `UI-GUIDE.md`: token, tipografi, dan urutan section yang meniru gutsai.id, dengan screenshot di `ui-reference/`.
5. `AI-SKILLS.md`: skill AI yang disarankan untuk mengerjakannya.
6. `LOCAL-WEBHOOK.md`: tes webhook Poketo di laptop dengan Cloudflare Tunnel.

| Fitur | Dokumen | Rilis |
|---|---|---|
| F00 Akun tunggal, bridge console, deployment | `features/F00-fondasi-akun-dan-integrasi.md` | R0 |
| F01 Pembayaran paket dengan Poketo | `features/F01-pembayaran-poketo.md` | R1 |
| F02 Pool global | `features/F02-pool-global.md` | R1 |
| F03 Subscription berjangka | `features/F03-subscription-berjangka.md` | R1 |
| F05 Admin paket dan harga flat | `features/F05-admin-paket.md` | R1 |
| F04 Kurs USD untuk tampilan | `features/F04-kurs-usd.md` | R2 |
| F08 Landing dan katalog | `features/F08-landing-dan-katalog.md` | R2 |
| F06 Promo dan diskon | `features/F06-promo-dan-diskon.md` | R3 |
| F07 Feed aktivitas | `features/F07-aktivitas-topup.md` | R3 |

## Keputusan utama

- **Hanya langganan.** User membayar harga flat paket (contoh: Bulanan $20 = Rp55.000). Tidak ada top up per dolar, dan saldo dompet console tidak diisi.
- **Satu paket aktif per user.** Paket baru menggantikan paket lama setelah user mengonfirmasi peringatan, dan sisa kredit paket lama kembali ke pool.
- **Deploy di satu VPS NAT** bersama New API. Komunikasi lewat network Docker internal.
- **Kredit setiap paket diambil dari pool global.** Sisa kredit paket yang hangus kembali ke pool.
- **Kurs hanya untuk tampilan** ("$10 ≈ Rp181.480"). Kurs tidak pernah dipakai untuk menghitung harga.
- **Harga ditetapkan admin**, termasuk diskon dan harga coret. Penentuan harga dibahas setelah sistem selesai.
- **aedoxy.com** memegang paket, harga, order, pembayaran, pool, dan kurs tampilan. **New API** memegang subscription aktif, pemotongan kredit, dan expiry.
- **Satu akun**: aedoxy.com menjadi OIDC provider, dan console login lewat "Aedoxy".
- **Fork Go hanya ditambah dua endpoint** (`accounts/ensure`, dan `fulfill` subscription yang idempoten).
- Rancangan provider Poketo native di `../topup-pool-poketo/` tidak dipakai lagi. `INTEGRASI-POKETO.md` di sana masih menjadi acuan detail teknis Poketo.
