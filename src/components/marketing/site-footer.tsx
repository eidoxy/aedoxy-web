import Link from "next/link";
import { site } from "@/config/site";
import { getCopyrightYear, getSiteSettings } from "@/server/site";

/** Giant faint wordmark. textLength pins it to the full container width at any viewport. */
function Wordmark({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 1000 250" aria-hidden className="block w-full select-none">
      <text
        x="0"
        y="200"
        fontSize="290"
        fontWeight="500"
        letterSpacing="-12"
        textLength="1000"
        lengthAdjust="spacing"
        style={{ fill: "var(--wordmark)", fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
      >
        {name}
      </text>
    </svg>
  );
}

export async function SiteFooter() {
  const [s, year] = await Promise.all([getSiteSettings(), getCopyrightYear()]);
  const contacts: { href: string; label: string }[] = [];
  if (s.supportEmail) contacts.push({ href: `mailto:${s.supportEmail}`, label: s.supportEmail });
  if (s.whatsappUrl) contacts.push({ href: s.whatsappUrl, label: "WhatsApp" });
  if (s.telegramUrl) contacts.push({ href: s.telegramUrl, label: "Telegram" });

  return (
    <footer className="section-rule mt-auto overflow-hidden">
      <div className="container-x pt-16 pb-8 md:pt-24">
        <Wordmark name={s.brandName} />
        <div className="mt-6 flex flex-col gap-4 text-[13px] text-fg-muted md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {s.companyName || s.brandName}. Hak cipta dilindungi. Console API ditenagai{" "}
            <a
              href="https://github.com/Calcium-Ion/new-api"
              rel="noopener noreferrer"
              target="_blank"
              className="underline underline-offset-2 hover:text-fg"
            >
              New API
            </a>
            .
          </p>
          <div className="flex flex-col gap-3 md:items-end">
            {contacts.length > 0 && (
              <nav aria-label="Kontak">
                <ul className="flex flex-wrap gap-x-6 gap-y-2">
                  {contacts.map((c) => (
                    <li key={c.href}>
                      <a href={c.href} rel="noopener noreferrer" target={c.href.startsWith("mailto:") ? undefined : "_blank"} className="hover:text-fg hover:underline">
                        {c.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <nav aria-label="Legal">
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {site.legal.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="hover:text-fg hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
