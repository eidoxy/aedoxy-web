import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { site } from "@/config/site";

/*
 * Copy follows PRD section 11 and F03/F08. TODO(owner): add the refund and
 * data-retention answers once the policies are final (they are linked, not summarised).
 */
const FAQ = [
  {
    q: "Bagaimana cara membayar paket?",
    a: "Pilih paket, lalu bayar dengan QRIS atau Virtual Account. Nominalnya sama dengan harga flat paket. Paket aktif otomatis setelah pembayaran terkonfirmasi.",
  },
  {
    q: "Apakah kompatibel dengan SDK OpenAI dan Anthropic?",
    a: "Ya. Ganti base URL dan API key di SDK Anda, lalu panggil model dengan format OpenAI Chat Completions atau Anthropic Messages.",
  },
  {
    q: "Apa yang terjadi dengan kredit saat paket berakhir?",
    a: "Sisa kredit hangus dan tidak dapat diuangkan. Kredit hanya berlaku selama masa aktif paket yang tertera di kartu paket.",
  },
  {
    q: "Bolehkah punya lebih dari satu paket aktif?",
    a: "Tidak. Satu akun hanya punya satu paket aktif. Jika Anda membeli paket baru saat paket lama masih aktif, paket lama digantikan dan sisa kreditnya hangus. Anda akan diminta mengonfirmasi hal ini sebelum membayar.",
  },
  {
    q: "Bagaimana jika kredit habis sebelum masa aktif berakhir?",
    a: "Request API ditolak sampai Anda membeli paket baru atau paket aktif kembali.",
  },
  {
    q: "Agen coding apa saja yang bisa dipakai?",
    a: "Agen apa pun yang mendukung base URL kustom dengan format OpenAI atau Anthropic, misalnya Claude Code, OpenCode, Cursor, dan Cline.",
  },
  {
    q: "Bagaimana kebijakan refund?",
    a: "Ketentuan refund ada di halaman Refund. Baca sebelum membeli paket.",
    href: "/refund",
  },
];

export function FaqSection() {
  return (
    <section className="section-rule">
      <div className="container-x grid gap-10 py-20 sm:py-28 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
        <div className="reveal">
          <p className="eyebrow">FAQ</p>
          <h2 className="mt-4 text-[34px] leading-[1.1] font-medium tracking-[-0.035em] text-heading sm:text-5xl">
            Sebelum
            <br />
            <span className="text-fg-muted">berlangganan.</span>
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-fg-muted">
            Pembayaran, paket, dan integrasi dijawab di sini. Detail teknis ada di dokumentasi.
          </p>
          <Button asChild variant="outline" className="mt-6 h-10 bg-surface px-4 text-sm font-semibold">
            <Link href={site.links.docs}>Baca dokumentasi</Link>
          </Button>
        </div>

        <Accordion type="single" collapsible defaultValue="faq-0" className="reveal">
          {FAQ.map((item, i) => (
            <AccordionItem key={item.q} value={`faq-${i}`} className="border-line data-open:rounded-2xl data-open:border-transparent data-open:bg-alt">
              <AccordionTrigger className="items-center gap-4 rounded-2xl px-5 py-5 text-[17px] font-medium text-heading hover:no-underline">
                <span className="w-4 shrink-0 font-mono text-xs font-normal text-primary-ink">{i + 1}</span>
                <span className="flex-1">{item.q}</span>
              </AccordionTrigger>
              <AccordionContent className="pr-12 pb-5 pl-14 text-[15px] leading-relaxed text-fg-muted">
                <p>
                  {item.a}{" "}
                  {item.href && (
                    <Link href={item.href} className="text-primary-ink underline underline-offset-2">
                      Buka halaman Refund
                    </Link>
                  )}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
