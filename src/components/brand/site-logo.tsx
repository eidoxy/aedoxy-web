import { getBrand } from "@/server/site";
import { Logo } from "./logo";

/** Logo for server components: reads the cached site settings itself. */
export async function SiteLogo({ className }: { className?: string }) {
  return <Logo className={className} brand={await getBrand()} />;
}
