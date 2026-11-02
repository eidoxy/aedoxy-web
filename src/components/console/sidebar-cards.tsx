import Link from "next/link";
import { CardSkeleton } from "@/components/console/skeletons";
import { Button } from "@/components/ui/button";
import { formatRemaining, formatUsd, QUOTA_PER_USD } from "@/lib/format";
import { getActivePlanForUser, getPoolAvailable } from "@/server/domain/user-plan";

const card = "rounded-xl border border-line bg-surface p-3 text-sm";

export function SidebarCardSkeleton() {
  return <CardSkeleton lines={1} className="space-y-2 rounded-xl p-3" />;
}

// Both cards are a convenience: when the query fails the sidebar shows none instead of breaking the page.
function logFailure(card: string, err: unknown) {
  console.error(`[console] sidebar card failed card=${card} reason=${err instanceof Error ? err.message : "unknown"}`);
}

export async function UserPlanCard({ userId }: { userId: string }) {
  let plan;
  try {
    plan = await getActivePlanForUser(userId);
  } catch (err) {
    logFailure("plan", err);
    return null;
  }
  return (
    <div className={card}>
      <p className="mono-label">Paket aktif</p>
      {plan ? (
        <>
          <p className="mt-1.5 truncate font-medium text-heading">{plan.name}</p>
          <p className="text-xs text-fg-muted">{formatRemaining(plan.endsAt)}</p>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-fg-muted">Belum ada paket</p>
          <Button asChild size="sm" className="mt-2 w-full">
            <Link href="/plans">Pilih paket</Link>
          </Button>
        </>
      )}
    </div>
  );
}

export async function AdminPoolCard() {
  let available;
  try {
    available = await getPoolAvailable();
  } catch (err) {
    logFailure("pool", err);
    return null;
  }
  return (
    <div className={card}>
      <p className="mono-label">Pool tersedia</p>
      <p className="mt-1.5 text-xl leading-none font-medium tracking-[-0.03em] text-heading">
        {available === null ? "-" : formatUsd(available / QUOTA_PER_USD)}
      </p>
      <Link href="/admin/pool" className="mt-2 inline-block text-xs text-primary-ink underline-offset-4 hover:underline">
        Kelola pool
      </Link>
    </div>
  );
}
