import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { site } from "@/config/site";
import { getSiteSettings } from "@/server/site";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName, tagline, description, assets } = await getSiteSettings();
  const title = tagline ? `${brandName}: ${tagline}` : brandName;
  const { favicon, og } = assets;
  return {
    metadataBase: new URL(site.url),
    title: { default: title, template: `%s | ${brandName}` },
    description,
    // The built-in icon lives in /public: a file in app/ would override this setting (file-based metadata wins).
    icons: { icon: favicon ? [{ url: favicon.url, type: favicon.contentType }] : [{ url: "/icon.svg", type: "image/svg+xml" }] },
    openGraph: {
      type: "website",
      siteName: brandName,
      title,
      description,
      locale: "id_ID",
      ...(og && { images: [{ url: og.url, width: og.width, height: og.height }] }),
    },
  };
}
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1012" },
  ],
};

// Runs before first paint so the saved (or system) theme never flashes.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Lewati ke konten
        </a>
        {children}
      </body>
    </html>
  );
}
