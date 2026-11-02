import type { Metadata } from "next";
import { LegalPage, LegalSection, Ph } from "@/components/marketing/legal";
import { getSiteSettings } from "@/server/site";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getSiteSettings();
  return {
    title: "Kebijakan Refund",
    description: `Ketentuan pengembalian dana paket ${brandName} dan cara mengajukannya.`,
  };
}

export default function RefundPage() {
  return (
    <LegalPage title="Kebijakan Refund" intro="Baca ketentuan ini sebelum membeli paket. Refund ditangani manual oleh kami, satu per satu.">
      <LegalSection title="1. Prinsip dasar">
        <ul>
          <li>Paket adalah kredit berjangka. Sisa kredit hangus saat paket berakhir dan tidak dapat diuangkan.</li>
          <li>Jika Anda mengganti paket aktif dengan paket baru, sisa kredit paket lama hangus. Hal itu diperingatkan dan dikonfirmasi sebelum Anda membayar, sehingga bukan dasar refund.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Kapan refund dapat diajukan">
        <p>
          Jendela pengajuan: <Ph>ISI: jumlah hari sejak pembayaran</Ph>. Kondisi yang memenuhi syarat refund, misalnya paket tidak dapat diaktifkan atau kredit
          belum terpakai: <Ph>ISI: kondisi refund yang diterima dan yang ditolak</Ph>.
        </p>
      </LegalSection>

      <LegalSection title="3. Cara mengajukan">
        <ul>
          <li>Kirim email ke <Ph>ISI: email kontak resmi</Ph> dari email akun Anda.</li>
          <li>Sertakan nomor transaksi (format ADX-…) yang ada di halaman Pesanan, dan alasan pengajuan.</li>
          <li>Kami meninjau pengajuan secara manual dan membalas dalam <Ph>ISI: target waktu balasan</Ph>.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Jika refund disetujui">
        <ul>
          <li>Paket terkait dinonaktifkan dan sisa kreditnya tidak dapat dipakai lagi.</li>
          <li>Dana dikembalikan lewat jalur pembayaran asal, melalui Poketo. Waktu pengembalian: <Ph>ISI: perkiraan waktu proses</Ph>.</li>
          <li>Biaya pembayaran Poketo yang Anda tanggung saat membeli: <Ph>ISI: dikembalikan atau tidak</Ph>.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Pembayaran berhasil tetapi paket belum aktif">
        <p>
          Aktivasi dicoba ulang otomatis bila gagal. Jika paket belum aktif setelah pembayaran terkonfirmasi, hubungi kami dengan nomor transaksi. Kami akan
          mengaktifkan paket atau memproses pengembalian dana.
        </p>
      </LegalSection>

      <LegalSection title="6. Chargeback dan sengketa">
        <p>
          Hubungi kami lebih dulu agar masalah bisa diselesaikan cepat. Penanganan sengketa pembayaran lewat pihak ketiga: <Ph>ISI: kebijakan chargeback</Ph>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
