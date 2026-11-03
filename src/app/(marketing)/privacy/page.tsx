import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, Ph } from "@/components/marketing/legal";
import { getSiteSettings } from "@/server/site";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getSiteSettings();
  return {
    title: "Kebijakan Privasi",
    description: `Data yang dikumpulkan ${brandName}, tujuannya, pihak yang menerimanya, feed aktivitas pembelian, dan hak Anda.`,
  };
}

export default async function PrivacyPage() {
  const { brandName } = await getSiteSettings();
  return (
    <LegalPage
      title="Kebijakan Privasi"
      intro={`Halaman ini menjelaskan data apa yang kami kumpulkan saat Anda memakai ${brandName}, untuk apa, dan apa yang bisa Anda lakukan atasnya.`}
    >
      <LegalSection title="1. Pengendali data">
        <p>
          Data Anda dikelola oleh <Ph>ISI: nama badan usaha atau penyelenggara</Ph>, beralamat di <Ph>ISI: alamat badan usaha</Ph>. Kontak untuk urusan data
          pribadi: <Ph>ISI: email kontak resmi</Ph>.
        </p>
      </LegalSection>

      <LegalSection title="2. Data yang kami kumpulkan">
        <ul>
          <li>Akun: nama dan email. Bila Anda masuk dengan Google, kami juga menerima foto profil Google Anda.</li>
          <li>Sesi dan keamanan: alamat IP dan jenis peramban pada sesi login, serta pengaturan keamanan akun.</li>
          <li>Pesanan dan pembayaran: nomor transaksi, paket, nominal, status, dan metode bayar. Kami tidak menyimpan data kartu atau rekening. Pembayaran diproses Poketo.</li>
          <li>Pemakaian API di console: catatan seperti model yang dipanggil, jumlah token, waktu, dan sisa kredit.</li>
          <li>
            Isi permintaan dan respons API (prompt): <Ph>ISI: apakah isi prompt dan respons disimpan, dan berapa lama</Ph>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Untuk apa data dipakai">
        <ul>
          <li>Membuat dan mengamankan akun, mengirim email verifikasi dan reset kata sandi.</li>
          <li>Memproses pembayaran, mengaktifkan paket, dan menangani pertanyaan atau refund.</li>
          <li>Menghitung pemakaian kredit dan menjaga layanan dari penyalahgunaan.</li>
          <li>Menampilkan feed aktivitas pembelian (bagian 5).</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Pihak ketiga yang menerima data">
        <ul>
          <li>Poketo, untuk memproses pembayaran QRIS.</li>
          <li>Google, bila Anda memilih masuk dengan Google.</li>
          <li>GitHub, bila Anda memilih masuk dengan GitHub.</li>
          <li>Penyedia model AI. Permintaan Anda diteruskan ke penyedia model yang Anda pilih agar dapat dijawab. Isi permintaan tunduk pada kebijakan penyedia itu.</li>
          <li>
            Penyedia hosting dan email: <Ph>ISI: nama penyedia dan lokasi server</Ph>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Feed aktivitas pembelian">
        <p>
          Beranda, halaman Pricing, dan halaman Paket dapat menampilkan baris seperti &ldquo;R•••a berlangganan Bulanan $20&rdquo; setelah pembelian paket berhasil.
          Aturannya:
        </p>
        <ul>
          <li>Yang tampil hanya huruf pertama dan terakhir nama Anda, nama paket, dan waktu yang dibulatkan ke menit. Nama dua huruf atau lebih pendek tampil sebagai &ldquo;Pengguna&rdquo;.</li>
          <li>Email, nomor telepon, harga yang dibayar, dan kode promo tidak pernah tampil.</li>
          <li>Hanya pembelian nyata yang berhasil diaktifkan, dalam 7 hari terakhir, satu item per pengguna. Feed disembunyikan bila item kurang dari 3.</li>
          <li>
            Fitur ini aktif secara default. Untuk berhenti tampil, matikan &ldquo;Tampilkan aktivitas saya&rdquo; di{" "}
            <Link href="/settings" className="text-primary-ink underline underline-offset-2">Pengaturan</Link> setelah login. Perubahan berlaku dalam hitungan detik, paling lama sekitar satu menit.
          </li>
          <li>Nama yang disamarkan masih dapat dianggap data pribadi, karena itu pilihan opt-out ada di tangan Anda.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Penyimpanan dan keamanan">
        <p>
          Data disimpan selama akun Anda aktif dan sepanjang diperlukan untuk catatan transaksi. Masa simpan data pesanan dan pemakaian:{" "}
          <Ph>ISI: lama penyimpanan</Ph>. Kami membatasi akses ke data dan memakai 2FA untuk akses admin.
        </p>
      </LegalSection>

      <LegalSection title="7. Hak Anda">
        <p>
          Sesuai UU Pelindungan Data Pribadi (UU 27/2022), Anda dapat meminta akses, perbaikan, atau penghapusan data Anda, dan menarik persetujuan. Kirim
          permintaan ke <Ph>ISI: email kontak resmi</Ph>. Sebagian data pesanan dapat tetap kami simpan bila hukum mewajibkan.
        </p>
      </LegalSection>

      <LegalSection title="8. Cookie dan penyimpanan di peramban">
        <p>Kami memakai cookie sesi agar Anda tetap login, dan penyimpanan lokal peramban untuk preferensi tampilan seperti tema. Kami tidak memakai cookie iklan.</p>
      </LegalSection>

      <LegalSection title="9. Perubahan">
        <p>
          Kebijakan ini dapat berubah. Versi terbaru berlaku sejak <Ph>ISI: tanggal berlaku</Ph> dan ditampilkan di halaman ini.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
