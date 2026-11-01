# Panduan UI: mengikuti gutsai.id

Arahan pemilik produk: tampilan aedoxy.com **semirip mungkin dengan [gutsai.id](https://gutsai.id/)**. Karena itu, dokumen ini sengaja tidak memakai saran "hindari tampilan template" dari skill frontend-design. Arahan pemilik yang berlaku.

Nilai di bawah diukur pada 2026-11-01 dari halaman live (computed style + sampel piksel dari screenshot 1440×900). Screenshot ada di `ui-reference/`, urut dari atas ke bawah halaman.

## Batas peniruan

Tiru layout, ritme, tipografi, palet, komponen, dan pola interaksinya. **Jangan salin** hal-hal berikut:
- Logo dan nama Guts AI.
- Ilustrasi pixel-art/dither (hutan, awan, patung). Buat aset sendiri dengan gaya serupa, misalnya pola dither dari gambar milik sendiri, SVG noise, atau ilustrasi berlisensi.
- Teks marketing kata per kata.
- Angka statistik mereka. Semua angka di aedoxy harus berasal dari data sendiri.

## Token

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `--bg` | `#f5f6f4` | Latar halaman (abu kehijauan sangat terang) |
| `--bg-alt` | `#eff2ef` | Latar section selang-seling (Rankings) |
| `--surface` | `#ffffff` / `#fafbfb` | Kartu, panel kode |
| `--fg` | `#162022` (judul `#03080a`) | Teks utama |
| `--fg-soft` | `#374151` | Teks isi |
| `--muted` | `#4b5563` | Paragraf sekunder |
| `--faint` | `#6b7280` | Label kecil, meta |
| `--line` | `rgba(3,8,10,.08)` | Border kartu, garis pemisah section (`#d3d6d2` saat di-render) |
| `--line-strong` | `rgba(3,8,10,.16)` | Border tombol sekunder |
| `--primary` | `#187565` | Tombol utama ("Get API Key"), link, eyebrow, angka sukses |
| `--primary-tint` | `#ddf1ec` | Bar pengumuman, chip sukses |
| `--grad-from` → `--grad-to` | `#208a7c` → `#5075ce` | Gradien teks baris kedua hero, border kartu yang disorot |
| `--illus` | `#2a6c5f` | Warna dasar panel ilustrasi dither |
| `--dark` | `#0f1416` | Section gelap (Billing) |
| `--dark-accent` | `#5eead4`-ish (teal terang) | Aksen di section gelap |
| `--accent-warm` | `#d66b3d` | Fokus ring (`rgba(214,107,61,.4)`) dan badge kecil |
| `--success` / `--danger` / `--warn` | `#16a34a` / `#dc2626` / `#8f6000` | Status |
| Shadow kartu | `0 1px 3px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.02)` | Kartu. Hover: `0 4px 12px rgba(0,0,0,.05)` |
| Tinggi header | 80px | |

Mode gelap ada (tombol tema di header). Turunkan token gelap dari `--dark` dan uji kontras AA.

## Tipografi

- **Sans: Geist** (computed `font-family` body dan h1). Pakai paket `geist` (`next/font`).
- **Mono: Geist Mono** untuk kode, angka teknis, eyebrow, label tabel, chip meta.
- H1 hero: 60px, weight 500, `letter-spacing: -0.04em` (-2.4px). Baris kedua memakai gradien `--grad-from → --grad-to`.
- H2 section: sekitar 48px, weight 500, tracking rapat. Baris kedua berwarna `--muted` (pola "Kalimat utama. / kalimat lanjutan." dalam dua warna).
- Eyebrow: mono, 12–13px, huruf besar, tracking lebar, warna `--primary` ("PLATFORM", "RELIABILITY", "FAQ").
- Isi: 17–18px, line-height sekitar 1.6, warna `--muted`.
- Angka besar statistik: sekitar 72px, weight 500, tracking sangat rapat, tanda "+" berwarna `--primary`.

## Layout

- Kontainer 1280px (padding 80px pada viewport 1440). Section dipisah garis tipis `--line` selebar penuh, dengan padding vertikal sekitar 120px.
- Radius: kartu 16–20px, tombol 8px, chip/pill penuh.
- Tombol utama: latar `--primary`, teks putih, weight 600, tinggi 52px di hero dan 40px di header, ikon ↗ kecil. Tombol sekunder: latar `--surface`, border `--line-strong`.

## Urutan section landing (sesuai screenshot)

| # | Section | File referensi | Versi Aedoxy |
|---|---|---|---|
| 1 | Bar pengumuman (latar `--primary-tint`, badge "NEW" hijau, tombol tutup) | `01-hero.png` | Promo/paket baru dari data admin |
| 2 | Header: logo kiri, nav tengah (Models, Pricing, Docs), tombol tema + CTA kanan. Sticky dengan border bawah saat scroll | `01-hero.png` | Nav: Models, Pricing, Docs. CTA "Mulai" / "Dashboard" |
| 3 | Hero 2 kolom: pill hijau ber-border gradien, H1 dua baris (baris 2 gradien), paragraf, 2 tombol, baris metode bayar. Kanan: panel ilustrasi dither berisi kartu kode bertab (python/node/curl, nomor baris, tombol Copy), strip respons ("200 OK · streaming"), chip model, dan pill provider di bawah | `01-hero.png` | Metode bayar: QRIS, Virtual Account. Model dari `/api/pricing` |
| 4 | Statistik 4 kolom (label mono, angka besar, chip/mini-chart, keterangan) + marquee logo provider dengan fade di tepi | `02-section-0.png` | Hanya angka nyata (jumlah model, provider). Sembunyikan kolom yang datanya belum ada |
| 5 | Platform: H2 kiri + paragraf kanan, bento grid (kartu besar dengan ilustrasi + daftar model, kartu "satu paket", kartu latency, kartu privasi) | `02`–`04` | Klaim hanya yang benar-benar dijalankan |
| 6 | Reliability: judul tengah, diagram routing interaktif (tab Availability/Cost/Latency), latar titik-titik | `04-section-2.png` | Opsional di v1. Bila dipakai, tandai sebagai ilustrasi |
| 7 | Rankings: latar `--bg-alt`, kiri judul, kanan tabel 3 model teratas (kartu pertama ber-border gradien) | `05-section-3.png` | Dari log pemakaian console (P2). Sembunyikan bila belum ada data |
| 8 | Get started: 3 langkah dengan nomor + garis progres + estimasi waktu, masing-masing dengan kartu demo | `06-section-4.png` | Daftar → Pilih paket & bayar QRIS → Buat API key |
| 9 | Integrations: daftar agent kiri (Claude Code aktif), terminal kanan dengan tombol traffic light | `07-section-5.png` | Base URL `https://ai.aedoxy.com` |
| 10 | Section gelap: langkah bernomor + kartu ber-border gradien (rincian biaya) | `08`–`09` | Diganti **cara kerja kredit paket**: beli paket → kredit masuk → pemakaian memotong kredit → sisa hangus saat masa aktif habis |
| 11 | FAQ: kiri judul + tombol chat, kanan accordion bernomor | `09`–`10` | Pertanyaan tentang paket, penggantian paket, kredit hangus, QRIS |
| 12 | CTA besar: kartu lebar ber-border gradien, judul raksasa, ilustrasi kanan | `10-section-8.png` | |
| 13 | Footer: wordmark raksasa abu `#d9dbd8` selebar halaman, copyright + link legal | `11-footer.png` | Wordmark "aedoxy" |

## Halaman `/models` (`12-models.png`)

- Header halaman: H1 "Model catalog", paragraf, info kecil, statistik kanan (MODELS, PROVIDERS).
- Toolbar: search (dengan hint `/`), dropdown provider/kemampuan/status/sort, toggle USD/IDR.
- Baris chip provider dengan logo.
- Per provider satu kartu: panel kiri 300px dengan ilustrasi dither + logo + nama + "N MODELS · FROM $x / 1M", lalu tabel kanan dengan kolom Model (mono), Context (in/out), Capabilities (ikon kotak), Status (titik hijau), Official (dicoret + "save N%"), dan Price / 1M ($ + "≈ Rp" kecil).
- Konversi Rp mengikuti F04: hanya untuk harga resmi provider.

## Panel user dan admin

Pakai token dan komponen yang sama: kartu putih, border `--line`, label mono, angka besar tracking rapat. Struktur dashboard bisa mengikuti shadcn (sidebar + konten), dengan gaya mengikuti token di atas.

## Gerak

- Elemen muncul saat di-scroll (fade + naik sedikit). Inilah sebabnya screenshot full-page tanpa scroll terlihat kosong.
- Marquee logo provider berjalan terus dengan fade di tepi. Hentikan saat hover, dan matikan bila `prefers-reduced-motion`.
- Kursor berkedip di demo respons hero dan terminal.
- Semua animasi wajib menghormati `prefers-reduced-motion`. Konten harus tetap terlihat walau JavaScript gagal: jangan mulai dari `opacity: 0` tanpa fallback.
