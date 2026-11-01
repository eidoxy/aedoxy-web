# Rekomendasi AI Skill

Dicari pada 2026-11-01 dengan `npx skills find <kata kunci>` (skill `find-skills`). Kata kunci yang dipakai: nextjs, better-auth, drizzle, shadcn, tailwind, postgres, payment webhook, stripe, security, owasp, idempotency, playwright, zod, frontend design, ui ux, accessibility, prd.

Kriteria seleksi: jumlah install (dari hasil pencarian) dan reputasi sumber (diutamakan repo resmi pemilik teknologi). Saya **belum** memeriksa jumlah star GitHub atau isi tiap skill. Baca dulu `SKILL.md`-nya sebelum dipasang.

## Inti (disarankan dipasang)

| Skill | Install | Sumber | Dipakai untuk |
|---|---|---|---|
| `vercel-labs/agent-skills@vercel-react-best-practices` | 859,4K | Vercel (resmi) | Pola React/Next.js dan performa. F00, F08 |
| `shadcn-ui/ui@shadcn` | 402,9K | shadcn (resmi) | Komponen UI panel, admin, landing |
| `better-auth/skills@better-auth-best-practices` | 129,2K | Better Auth (resmi) | Setup auth, plugin admin, OAuth provider. F00 |
| `better-auth/skills@better-auth-security-best-practices` | 49,3K | Better Auth (resmi) | Hardening auth dan OIDC provider |
| `better-auth/skills@two-factor-authentication-best-practices` | 35,7K | Better Auth (resmi) | 2FA wajib untuk admin |
| `anthropics/skills@frontend-design` | 1,1M | Anthropic | Desain visual landing yang tidak generik. F08 |
| `vercel-labs/agent-skills@web-design-guidelines` | 810,3K | Vercel (resmi) | Review UI/UX dan aksesibilitas (ticker F07, form checkout) |
| `supabase/agent-skills@supabase-postgres-best-practices` | 469,1K | Supabase (resmi) | Indeks, locking, query Postgres. Isinya berorientasi Supabase, tetapi bagian Postgres tetap berlaku |
| `anthropics/skills@webapp-testing` | 194,5K | Anthropic | Test e2e Playwright alur checkout sandbox |

## Opsional

| Skill | Install | Sumber | Kapan berguna |
|---|---|---|---|
| `mattpocock/skills@to-issues` | 339,1K | Matt Pocock | Memecah dokumen planning F00–F08 menjadi issue GitHub |
| `addyosmani/agent-skills@security-and-hardening` | 75,4K | Addy Osmani | Review keamanan sebelum go-live |
| `getsentry/skills@security-review` | 22K | Sentry (resmi) | Review keamanan kode per PR |
| `samber/developer-platform-skills@api-idempotency-retry` | 9,5K | samber (penulis `samber/lo`, yang dipakai New API) | Pola idempotensi dan retry untuk outbox dan bridge. Install-nya masih sedikit, jadi baca isinya dulu |
| `stripe/ai@stripe-best-practices` | 31,6K | Stripe (resmi) | Hanya sebagai referensi pola webhook dan idempotensi. Isinya khusus Stripe |
| `wshobson/agents@nextjs-app-router-patterns` | 33,1K | Komunitas | Pola App Router tambahan, bila skill Vercel belum cukup |

## Tidak disarankan

| Skill | Alasan |
|---|---|
| Skill Drizzle (`drizzle-orm-patterns`, `lobehub/lobehub@drizzle`, dll.) | Maksimal 5,5K install dan dari penulis komunitas, atau terikat ke codebase pemiliknya. Pakai dokumentasi Drizzle langsung |
| `clerk/skills@clerk-nextjs-patterns`, `supabase/agent-skills@supabase`, `prisma/skills@*`, `cloudflare/skills@nextjs-on-cloudflare` | Stack-nya berbeda (rancangan memakai Better Auth, Drizzle, dan VPS sendiri) |
| `dodopayments/skills@webhook-integration` | 1,1K install, khusus Dodo Payments |
| `antibrow/anti-detect-browser-skills@anti-detect-browser` | Muncul di pencarian "playwright", tetapi tujuannya menghindari deteksi bot. Tidak relevan dan tidak pantas dipakai |

## Sumber pengetahuan non-skill

| Sumber | Kegunaan |
|---|---|
| [poketo.id/llms.txt](https://poketo.id/llms.txt) | Ringkasan seluruh API Poketo untuk coding agent |
| Server MCP Poketo `https://poketo.id/api/mcp` dengan key **sandbox** | Agen bisa membuat dan mensimulasikan invoice saat pengujian. Jangan pakai key live |
| `gateway-aedoxy/AGENTS.md` dan `gateway-aedoxy/.agents/rules/billing.md` | Aturan wajib saat mengerjakan bridge Go (tiga database, konversi kuota, JSON wrapper) |
| [Dokumentasi plugin OAuth 2.1 Provider Better Auth](https://better-auth.com/docs/plugins/oauth-provider) | Integrasi SSO console (F00) |

## Cara memasang

```bash
# per proyek (jalankan di folder aedoxy-web)
npx skills add vercel-labs/agent-skills@vercel-react-best-practices

# global untuk user, tanpa konfirmasi
npx skills add better-auth/skills@better-auth-best-practices -g -y
```

Detail tiap skill: `https://skills.sh/<owner>/<repo>/<skill>`, misalnya [skills.sh/better-auth/skills/better-auth-best-practices](https://skills.sh/better-auth/skills/better-auth-best-practices).
