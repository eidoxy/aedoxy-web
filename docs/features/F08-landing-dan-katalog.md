# F08 Landing Page dan Katalog Model

Prioritas P1 · Rilis R2 · Bergantung pada F00, F04 · Referensi UI: [gutsai.id](https://gutsai.id/)

## Tujuan

Pengunjung memahami layanan, melihat model dan paket langganan, lalu mendaftar dan berlangganan.

## Struktur landing (mengikuti pola gutsai.id)

Struktur di bawah saya ambil dari struktur halaman gutsai.id (judul bagian, navigasi, tombol). Saya tidak menilai warna atau tipografinya, jadi tentukan sendiri tema visualnya.

| # | Bagian | Isi untuk Aedoxy |
|---|---|---|
| 1 | Bar pengumuman | Promo aktif (F06) atau model baru, dan bisa ditutup |
| 2 | Navigasi | Models, Pricing, Docs, Status, pilihan tema (terang/gelap/sistem), tombol "Dashboard" atau "Daftar" |
| 3 | Hero | Judul satu kalimat ("Satu API key untuk semua model AI"), CTA "Dapatkan API key" + "Lihat model", contoh kode dengan tab Python / Node / cURL dan tombol salin, chip model populer |
| 4 | Ticker aktivitas | Komponen F07 |
| 5 | Keunggulan (bento grid) | Kompatibel format OpenAI dan Anthropic, satu paket untuk semua provider, harga flat bayar QRIS, privasi prompt (tulis hanya klaim yang benar-benar Anda jalankan) |
| 6 | Kompatibilitas coding agent | Claude Code, OpenCode, Cursor, Cline, dan lainnya, masing-masing dengan potongan konfigurasi `base_url` + API key |
| 7 | Paket | Kartu paket dari tabel `plans` dengan tab Mingguan / Bulanan, harga flat, harga coret, dan konversi "≈ Rp" kredit (F04) |
| 8 | Mulai dalam 3 langkah | Daftar → Pilih paket dan bayar → Buat API key di console |
| 9 | FAQ | Kredit hangus, metode bayar, refund, fair use, keamanan data |
| 10 | Footer | Syarat, Privasi, Refund, Status, Kontak, atribusi New API untuk console |

Gutsai menampilkan angka seperti "tokens processed" dan "developers". Tampilkan angka seperti ini hanya jika berasal dari data nyata (misalnya statistik console). Jangan memakai angka perkiraan.

## Halaman `/models`

Pola gutsai: tabel per provider dengan kolom model, context (input/output), kemampuan (Text, Image, File, Reasoning), status, harga resmi, dan biaya pemakaian per 1 juta token.

| Data | Sumber |
|---|---|
| Daftar model, vendor, rasio harga, grup yang boleh | `GET /api/pricing` New API (+ `GET /api/aedoxy/model-prices` untuk model berekspresi), cache 10 menit |
| Context window, kemampuan, harga resmi | Metadata yang diisi admin di aedoxy (tabel `model_meta`), karena New API tidak menyimpan data ini secara lengkap |
| Biaya pemakaian | **Kredit $ per 1 juta token** dari rasio model New API. Rumusnya harus diverifikasi untuk setiap mode harga New API (rasio, harga tetap, billing expression). Jangan dikonversi ke rupiah dengan kurs pasar, karena kredit $ dibeli lewat harga flat paket, bukan dengan kurs. Konversi itu akan membuat model tampak jauh lebih mahal daripada kenyataannya |
| Harga resmi | $ per 1 juta token, boleh diberi konversi "≈ Rp" (F04) karena nilainya memang dolar sungguhan |
| Status | Opsional: dari status kanal atau uptime console |

Kolom tambahan yang membantu pembeli: "≈ token per paket", misalnya "Bulanan $20 ≈ 10 juta token output model ini", dihitung dari kredit paket ÷ biaya per token.

Fitur halaman: kelompok per provider dengan logo (`@lobehub/icons`), pencarian, filter kemampuan, urutkan berdasarkan harga atau context, dan tombol salin nama model.

## Halaman lain

- `/pricing`: paket per periode (Mingguan / Bulanan), tabel perbandingan paket, dan FAQ kredit hangus.
- `/docs`: cara memakai base URL dan API key, contoh untuk tiap coding agent, dan tautan ke console.
- `/terms`, `/privacy`, `/refund`: wajib ada sebelum go-live. Penyedia pembayaran umumnya memeriksa halaman ini. Isinya mencakup fair use, kredit hangus, kebijakan refund, dan data yang ditampilkan di feed.

## Teknis

- Halaman publik memakai Server Components + ISR (`revalidate` 300–3600 detik).
- Metadata SEO dan Open Graph per halaman, dan `sitemap.xml`.
- Target LCP < 2,5 detik. Gambar memakai `next/image` dan font memakai `next/font`.

## Tugas

| # | Tugas | Ukuran |
|---|---|---|
| 1 | Layout publik, navigasi, footer, tema | S |
| 2 | Hero + contoh kode bertab + salin | M |
| 3 | Bento keunggulan, kompatibilitas agent, langkah, FAQ | M |
| 4 | `/models`: integrasi `/api/pricing`, `model_meta` + form admin, tabel, filter | L |
| 5 | `/pricing` + tabel perbandingan paket | S |
| 6 | Halaman legal (draf, ditinjau Anda) | S |
| 7 | SEO, sitemap, uji Lighthouse | S |

## Selesai bila

- Semua harga dan angka di landing dan di `/models` berasal dari data (`plans`, kurs tampilan, `/api/pricing`). Tidak ada angka yang ditulis langsung di kode.
- Lighthouse mobile: Performance ≥ 90 dan Accessibility ≥ 95.
