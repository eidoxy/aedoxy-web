import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";

/*
 * Placeholder for routes that later waves implement (docs, legal, auth entry).
 * Static segments such as /models and /pricing take precedence, and a real
 * /docs/page.tsx (etc.) added later overrides the matching entry here.
 */
const STUBS: Record<string, { title: string; text: string }> = {
  docs: { title: "Dokumentasi", text: "Panduan base URL, API key, dan contoh untuk tiap agen coding akan tersedia di sini." },
  terms: { title: "Syarat Layanan", text: "Draf syarat layanan sedang disiapkan." },
  privacy: { title: "Kebijakan Privasi", text: "Draf kebijakan privasi sedang disiapkan." },
  refund: { title: "Kebijakan Refund", text: "Draf kebijakan refund sedang disiapkan." },
  login: { title: "Masuk", text: "Halaman masuk akan tersedia setelah integrasi akun selesai." },
  register: { title: "Daftar", text: "Pendaftaran akan tersedia setelah integrasi akun selesai." },
};

export function generateStaticParams() {
  return Object.keys(STUBS).map((stub) => ({ stub }));
}

export default async function StubPage({ params }: PageProps<"/[stub]">) {
  const { stub } = await params;
  const page = STUBS[stub];
  if (!page) notFound();
  return (
    <section className="container-x py-24 sm:py-32">
      <p className="eyebrow">Segera hadir</p>
      <h1 className="mt-4 text-5xl font-medium tracking-[-0.04em] text-heading">{page.title}</h1>
      <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-fg-muted">{page.text}</p>
      <Button asChild variant="outline" className="mt-8 h-11 bg-surface px-5 text-sm font-semibold">
        <Link href="/">Kembali ke beranda</Link>
      </Button>
    </section>
  );
}

export async function generateMetadata({ params }: PageProps<"/[stub]">) {
  const { stub } = await params;
  return { title: STUBS[stub]?.title ?? "Halaman" };
}
