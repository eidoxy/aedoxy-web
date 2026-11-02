import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { fillLegalPlaceholder } from "@/lib/schemas/site";
import { getSiteSettings } from "@/server/site";

/** Shared frame for /terms, /privacy and /refund. Copy is a draft until the owner replaces every [ISI: ...] and has it reviewed. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <article className="container-x py-14 sm:py-20">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-4 text-[40px] leading-none font-medium tracking-[-0.045em] text-heading sm:text-5xl">{title}</h1>
      <p role="note" className="mt-6 flex max-w-3xl items-start gap-2.5 rounded-xl border border-warn/40 bg-alt p-4 text-sm leading-relaxed text-fg-soft">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        <span>
          <strong className="font-semibold text-heading">Draf, belum ditinjau hukum.</strong> Bagian bertanda <Ph>ISI: ...</Ph> belum diputuskan dan akan
          dilengkapi sebelum layanan dibuka untuk umum.
        </span>
      </p>
      <p className="mt-6 max-w-3xl text-[17px] leading-relaxed text-fg-muted">{intro}</p>
      <div className="mt-10 max-w-3xl space-y-10">{children}</div>
      <nav aria-label="Dokumen legal lain" className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-sm text-fg-muted">
        <Link href="/terms" className="hover:text-heading hover:underline">Syarat Layanan</Link>
        <Link href="/privacy" className="hover:text-heading hover:underline">Kebijakan Privasi</Link>
        <Link href="/refund" className="hover:text-heading hover:underline">Kebijakan Refund</Link>
      </nav>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-medium tracking-[-0.02em] text-heading">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-fg-muted [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">{children}</div>
    </section>
  );
}

/**
 * A decision the owner has not made yet. Shown in brackets and highlighted so it cannot be missed.
 * The three that /admin/settings can answer (business name, address, contact email) turn into plain text once filled in.
 */
export async function Ph({ children }: { children: string }) {
  const filled = fillLegalPlaceholder(children, await getSiteSettings());
  if (filled) return <>{filled}</>;
  return <mark className="rounded bg-warn/20 px-1 font-mono text-[0.9em] text-heading">[{children}]</mark>;
}
