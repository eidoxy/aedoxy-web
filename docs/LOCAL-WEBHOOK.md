# Tes lokal webhook Poketo dengan Cloudflare Tunnel

Poketo hanya mengirim webhook ke URL `https://` publik. Redirect tidak diikuti, dan alamat jaringan privat (termasuk `localhost`) ditolak. Cloudflare Tunnel membuka URL HTTPS publik yang meneruskan request ke aplikasi di laptop Anda.

> Endpoint `POST /api/webhooks/poketo` dibuat di gelombang 3 (F01). Sebelum endpoint itu ada, "Kirim tes" dari Poketo akan mendapat 404. Itu wajar, dan berarti tunnel-nya sudah bekerja.

## 1. Pasang cloudflared (sekali saja)

```powershell
winget install --id Cloudflare.cloudflared
cloudflared --version
```

## 2. Jalankan aplikasi di port 3000

Dari folder `aedoxy-web`, setelah `bun run build`:

```powershell
$env:PORT="3000"; $env:HOSTNAME="127.0.0.1"
node .next/standalone/server.js
```

Untuk `next start` dengan `output: standalone`, salin dulu `.next/static` ke `.next/standalone/.next/static` (dan `public` ke `.next/standalone/public`). Selama pengembangan, `bun run dev` juga bisa dipakai.

## 3a. Quick tunnel (tanpa akun, paling cepat)

Di terminal kedua:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Output-nya memuat URL seperti `https://<kata-acak>.trycloudflare.com`. URL ini **berubah setiap kali tunnel dijalankan ulang**, jadi URL webhook di Poketo harus diganti juga.

## 3b. Named tunnel (URL tetap, misalnya `dev.aedoxy.com`)

Syaratnya: DNS domain `aedoxy.com` dikelola di Cloudflare.

```powershell
cloudflared tunnel login                      # buka browser, pilih aedoxy.com
cloudflared tunnel create aedoxy-dev          # mencetak UUID dan file kredensial
cloudflared tunnel route dns aedoxy-dev dev.aedoxy.com
```

Buat `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: aedoxy-dev
credentials-file: C:\Users\<user>\.cloudflared\<UUID>.json
ingress:
  - hostname: dev.aedoxy.com
    service: http://localhost:3000
  - service: http_status:404
```

Lalu jalankan:

```powershell
cloudflared tunnel run aedoxy-dev
```

Dengan cara ini URL webhook tidak perlu diganti-ganti. Cara yang sama juga bisa dipakai di VPS NAT produksi bila port 80/443 tidak bisa di-forward (TRD bagian 12).

## 4. Daftarkan URL webhook di Poketo dan ambil `whsec_…`

1. Dashboard Poketo → **Developer → Proyek & API** → proyek **sandbox** Anda.
2. Isi URL webhook: `https://<url-tunnel>/api/webhooks/poketo`. Pakai URL persis dari tunnel. Jangan tambah atau hilangkan `/` di akhir, karena Poketo tidak mengikuti redirect.
3. Simpan. Rahasia penandatanganan `whsec_…` akan ditampilkan.
4. Isi `aedoxy-web/.env.local`:
   ```
   POKETO_WEBHOOK_SECRET=whsec_...
   ```
   Jangan commit file ini (`.env*` sudah di-ignore).
5. Jalankan ulang aplikasi agar env baru terbaca.
6. Tekan **Kirim tes** di dashboard Poketo. Event `ping` harus mendapat **200** setelah endpoint gelombang 3 ada. Riwayat pengiriman dan kode respons terlihat di dashboard proyek.

## 5. Uji alur pembayaran

1. Buat order dari aplikasi, atau langsung lewat API sandbox.
2. Simulasikan pembayaran:
   ```powershell
   $h = @{ Authorization = "Bearer $env:POKETO_SECRET_KEY"; "Content-Type" = "application/json" }
   Invoke-RestMethod -Method Post -Uri "https://poketo.id/api/v1/invoices/<referenceId-atau-INV-PKT-...>/simulate" `
     -Headers $h -Body '{"result":"paid","paymentMethod":"QRIS"}'
   ```
   Halaman bayar sandbox juga punya tombol simulasi.
3. Periksa: webhook `invoice.paid` tercatat 200 di dashboard Poketo, order berstatus `paid`, lalu paket aktif di console.
4. Ulangi dengan `"result":"expired"` untuk menguji pelepasan reservasi pool.

## Keamanan

- Tunnel membuat server lokal bisa diakses publik. Matikan tunnel (Ctrl+C) setelah selesai tes.
- Pakai hanya key **sandbox** (`sk_test_…`) di laptop. Jangan jalankan tunnel dengan key live.
- Webhook ditolak (401) bila tanda tangan salah, timestamp lebih dari 5 menit, atau `POKETO_WEBHOOK_SECRET` kosong. Jam laptop harus sinkron (Windows: Settings → Time → Sync now).
- Bila webhook tidak dipakai, order tetap terkonfirmasi lewat worker yang mengecek `GET /v1/invoices/:id`. Hanya saja lebih lambat.
