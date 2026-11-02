import Link from "next/link";
import { DitherPanel } from "@/components/brand/dither-panel";
import { SiteLogo } from "@/components/brand/site-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const TITLE = "Halaman tidak ditemukan";
const TEXT = "Alamat yang Anda buka tidak ada atau sudah dipindahkan.";

/** Full page 404 (app/not-found.tsx): the brand dither panel with a large 404, then the way back. */
export function NotFoundPage() {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-5 py-12">
      <SiteLogo className="mb-8" />
      <DitherPanel seed={4} className="flex h-44 w-full max-w-xl items-center justify-center rounded-[20px] border border-line sm:h-60">
        <p aria-hidden className="font-mono text-7xl font-medium tracking-[-0.06em] text-white select-none sm:text-9xl">
          404
        </p>
      </DitherPanel>
      <h1 className="mt-8 text-center text-2xl font-medium tracking-[-0.03em] text-heading sm:text-3xl">{TITLE}</h1>
      <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-fg-muted">
        <span className="sr-only">Kode 404. </span>
        {TEXT}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild className="h-10 px-4 text-sm font-semibold">
          <Link href="/">Kembali ke beranda</Link>
        </Button>
        <Button asChild variant="outline" className="h-10 bg-surface px-4 text-sm font-semibold">
          <Link href="/dashboard">Ke dashboard</Link>
        </Button>
      </div>
    </main>
  );
}

/** Compact 404 for the content area: the console shell (menu, header) stays on screen around it. */
export function NotFoundInShell({ homeHref, homeLabel }: { homeHref: string; homeLabel: string }) {
  return (
    <Card className="items-start gap-0 px-6 py-8">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-2xl font-medium tracking-[-0.03em] text-heading">{TITLE}</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">{TEXT}</p>
      <Button asChild className="mt-5 h-10 px-4 text-sm font-semibold">
        <Link href={homeHref}>{homeLabel}</Link>
      </Button>
    </Card>
  );
}