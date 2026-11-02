import type { Metadata } from "next";
import { LegalPage, LegalSection, Ph } from "@/components/marketing/legal";
import { getSiteSettings } from "@/server/site";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getSiteSettings();
  return {
    title: "Syarat Layanan",
    description: `Syarat penggunaan layanan ${brandName}: paket kredit berjangka, pembayaran, fair use, dan batas tanggung jawab.`,
  };
}

export default async function TermsPage() {
  const { brandName } = await getSiteSettings();
  return (
    <LegalPage
      title="Syarat Layanan"
      intro={`Dengan mendaftar atau membeli paket di ${brandName}, Anda menyetujui syarat berikut. Baca bersama Kebijakan Privasi dan Kebijakan Refund.`}
    >
      <LegalSection title="1. Penyelenggara dan layanan">
        <p>
          {brandName} adalah layanan langganan kredit API. Satu API key dan satu base URL memberi akses ke berbagai model AI lewat console API kami. Layanan
          diselenggarakan oleh <Ph>ISI: nama badan usaha atau penyelenggara</Ph>, beralamat di <Ph>ISI: alamat badan usaha</Ph>. Kontak ada di bagian 10.
        </p>
      </LegalSection>

      <LegalSection title="2. Akun">
        <ul>
          <li>Anda mendaftar dengan email atau akun Google. Email harus diverifikasi sebelum Anda bisa membeli paket atau membuka console.</li>
          <li>Anda bertanggung jawab atas keamanan akun dan API key Anda. API key bersifat pribadi dan tidak boleh dibagikan atau dijual kembali.</li>
          <li>Data yang Anda berikan harus benar.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Paket dan kredit berjangka">
        <ul>
          <li>Anda membayar harga flat dalam rupiah. Hasilnya adalah kredit dalam dolar AS yang dipotong setiap kali Anda memakai model.</li>
          <li>Kredit berlaku selama masa aktif paket, dihitung sejak pembayaran terkonfirmasi. Saat paket berakhir, sisa kredit hangus. Kredit tidak dapat diuangkan, dipindahkan, atau diperpanjang.</li>
          <li>Jika kredit habis sebelum masa aktif berakhir, permintaan API ditolak sampai Anda membeli paket baru.</li>
          <li>Biaya kredit tiap model ditampilkan di halaman Katalog model dan dapat berubah. Perubahan tidak berlaku surut untuk pemakaian yang sudah terjadi.</li>
          <li>Nilai rupiah yang ditandai &ldquo;≈&rdquo; hanyalah perkiraan tampilan dari kurs dolar. Itu bukan harga dan bukan dasar tagihan.</li>
          <li>Pembelian dapat tidak tersedia sementara bila stok kredit kami habis.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Satu paket aktif dan penggantian paket">
        <p>
          Satu akun hanya punya satu paket aktif. Jika Anda membeli paket baru saat paket lama masih aktif, paket lama berakhir ketika paket baru aktif dan sisa
          kreditnya hangus. Anda akan melihat peringatan ini dan diminta mengonfirmasi sebelum membayar.
        </p>
      </LegalSection>

      <LegalSection title="5. Pembayaran">
        <ul>
          <li>Pembayaran lewat QRIS, diproses oleh Poketo. Kami tidak menyimpan data kartu atau rekening Anda.</li>
          <li>Biaya pembayaran Poketo ditanggung pembeli. Perkiraan total yang Anda bayar ditampilkan sebelum Anda membayar.</li>
          <li>Invoice berlaku 15 menit. Order yang tidak dibayar dalam waktu itu kedaluwarsa. Jika pembayaran tetap masuk setelah invoice kedaluwarsa, paket tetap kami aktifkan.</li>
          <li>Paket aktif otomatis setelah pembayaran terkonfirmasi. Bila aktivasi tertunda, sistem mencoba ulang secara otomatis. Hubungi kami jika paket belum aktif.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Fair use">
        <p>
          Gunakan layanan secara wajar. Batas pemakaian wajar: <Ph>ISI: batas fair use, misalnya laju permintaan atau batas harian</Ph>. Kami dapat membatasi laju
          permintaan, atau menolak pembelian, bila pemakaian membebani layanan atau merugikan pengguna lain.
        </p>
      </LegalSection>

      <LegalSection title="7. Penggunaan yang dilarang">
        <ul>
          <li>Melanggar hukum yang berlaku, atau ketentuan penyedia model yang Anda akses lewat layanan ini.</li>
          <li>Membagikan atau menjual ulang API key, atau mengakses layanan dengan cara yang menghindari batas pemakaian.</li>
          <li>Mengganggu, memindai, atau berupaya menembus keamanan layanan.</li>
        </ul>
        <p>
          Konsekuensi pelanggaran, termasuk penangguhan akun: <Ph>ISI: kebijakan penangguhan dan nasib sisa kredit</Ph>.
        </p>
      </LegalSection>

      <LegalSection title="8. Ketersediaan dan batas tanggung jawab">
        <p>
          Model berasal dari penyedia pihak ketiga, sehingga ketersediaan dan hasilnya dapat berubah di luar kendali kami. Komitmen ketersediaan:{" "}
          <Ph>ISI: ada atau tidak SLA</Ph>. Batas tanggung jawab kami: <Ph>ISI: batas tanggung jawab</Ph>.
        </p>
      </LegalSection>

      <LegalSection title="9. Perangkat lunak sumber terbuka">
        <p>
          Console API ditenagai{" "}
          <a href="https://github.com/Calcium-Ion/new-api" target="_blank" rel="noopener noreferrer" className="text-primary-ink underline underline-offset-2">
            New API
          </a>
          , perangkat lunak sumber terbuka berlisensi AGPL-3.0. Console kami adalah versi yang dimodifikasi. Kode sumber versi yang kami jalankan tersedia di{" "}
          <Ph>ISI: URL repositori kode sumber console</Ph>.
        </p>
      </LegalSection>

      <LegalSection title="10. Perubahan, hukum yang berlaku, dan kontak">
        <ul>
          <li>Kami dapat mengubah syarat ini. Versi terbaru berlaku sejak <Ph>ISI: tanggal berlaku</Ph> dan ditampilkan di halaman ini.</li>
          <li>Hukum yang berlaku dan tempat penyelesaian sengketa: <Ph>ISI: hukum dan yurisdiksi</Ph>.</li>
          <li>Kontak: <Ph>ISI: email kontak resmi</Ph>.</li>
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
