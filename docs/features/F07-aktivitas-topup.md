# F07 Feed Aktivitas Pembelian Paket

Prioritas P2 · Rilis R3 · Bergantung pada F01, F03

## Tujuan

Menunjukkan bahwa layanan dipakai orang lain, dengan data nyata dan tanpa membuka data pribadi.

## Rekomendasi komponen

Saya tidak menyarankan marquee horizontal yang terus berjalan. Alasannya:

- Teks yang bergerak terus sulit dibaca, terutama di ponsel.
- WCAG 2.2.2 mewajibkan tombol jeda untuk konten bergerak yang berlangsung lebih dari 5 detik.
- Gerakan terus-menerus di dekat tombol bayar mengganggu fokus.

Gantinya, gunakan dua komponen sesuai tempatnya:

| Tempat | Komponen | Perilaku |
|---|---|---|
| Landing (di bawah hero) dan header `/pricing` | **Ticker vertikal satu baris** | Satu aktivitas tampil, lalu diganti yang berikutnya setiap 4 detik dengan animasi geser ke atas atau fade. Berhenti saat di-hover atau difokus. Ada tombol jeda kecil. Dengan `prefers-reduced-motion`, ticker tidak beranimasi dan item hanya diganti tanpa gerakan |
| `/plans` (di samping atau di bawah daftar paket) | **Kartu "Aktivitas terbaru"** | Daftar statis 5 item terakhir, diperbarui setiap 30–60 detik tanpa animasi masuk yang mencolok |

Pop-up toast ("X baru saja membeli...") tidak disarankan karena menutupi konten di ponsel dan terasa seperti trik penjualan.

Contoh isi:

```
⚡ R•••a berlangganan Bulanan $20 · 2 jam lalu
⚡ A•••n berlangganan Mingguan $7 · 15 menit lalu
```

## Aturan data

| Aturan | Detail |
|---|---|
| Sumber | Hanya order `paid` dengan aktivasi paket `succeeded`. Tidak ada data rekaan atau "bot". Feed palsu bisa melanggar kebijakan Poketo dan perlindungan konsumen |
| Nama | Huruf pertama + `•••` + huruf terakhir dari nama tampilan. Nama dengan ≤ 2 huruf menjadi "Pengguna". Email dan nomor telepon tidak pernah dipakai |
| Isi | Nama paket (periode + kredit). Harga yang dibayar dan kode promo tidak ditampilkan |
| Waktu | Relatif ("2 jam lalu"), dibulatkan ke menit atau jam. Waktu persis tidak ditampilkan |
| Opt-out | `/settings` → "Tampilkan aktivitas saya" (default: tampil tersamar). Jelaskan di kebijakan privasi |
| Data basi | Sembunyikan item lebih lama dari 7 hari. Sembunyikan seluruh komponen jika item kurang dari 3, karena feed yang menampilkan "3 hari lalu" justru memberi kesan sepi |
| Volume | Maksimal 1 item per user dalam 20 item terakhir, agar satu pembeli tidak mendominasi feed |

Nama yang disamarkan tetap bisa dianggap data pribadi menurut UU PDP. Opt-out dan penjelasan di kebijakan privasi adalah batas minimum. Untuk lebih aman, Anda bisa memilih default opt-in (`../PRD.md` bagian 11 nomor 4).

## Endpoint

`GET /api/public/activity` → `[{ "label": "R•••a", "plan": "Bulanan $20", "at": "2026-11-01T10:00:00Z" }]`

- Dihitung di server, dengan cache 30 detik (`revalidate`) dan rate limit per IP.
- Hanya mengembalikan field di atas. ID user dan ID order tidak pernah dikirim.
- Client melakukan polling dengan TanStack Query (`refetchInterval` 60 detik, berhenti saat tab tidak aktif).

## Aksesibilitas

- Ticker memakai `aria-live="off"` agar pembaca layar tidak terus diinterupsi. Sediakan tautan "Lihat aktivitas terbaru" yang membuka daftar statis.
- Kontras teks memenuhi AA, dan target sentuh tombol jeda ≥ 24×24 px.

## Admin `/admin/activity`

- Toggle global untuk menampilkan atau menyembunyikan feed.
- Pilihan paket yang boleh tampil (misalnya sembunyikan paket promo).
- Daftar item yang sedang tampil + tombol "Sembunyikan item ini".

## Tugas

| # | Tugas | Ukuran |
|---|---|---|
| 1 | Query + fungsi samaran nama + unit test (nama pendek, emoji, satu kata) | S |
| 2 | Endpoint publik + cache + rate limit | S |
| 3 | Komponen ticker (jeda, hover/fokus, reduced motion) + kartu daftar | M |
| 4 | Opt-out di `/settings` + teks kebijakan privasi | S |
| 5 | Pengaturan admin | S |

## Selesai bila

- Tidak ada email, ID, atau harga yang dibayar di respons endpoint.
- Ticker bisa dijeda dengan keyboard, dan tidak bergerak saat `prefers-reduced-motion` aktif.
- User yang opt-out tidak muncul dalam ≤ 60 detik.
