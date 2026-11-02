import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/console/page-header";
import { TableCard } from "@/components/console/table-card";
import { OrderBadge } from "@/components/panel/order-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIdr } from "@/lib/format";
import { listOrdersForUser, planNameOf } from "@/server/domain/order-view";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Pesanan" };

export default function OrdersPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-72 rounded-[18px] border border-line bg-surface" />}>
      <Orders />
    </Suspense>
  );
}

const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

async function Orders() {
  const { user } = await requireSession();
  const rows = await listOrdersForUser(user.id);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Pesanan" title="Riwayat pesanan" description="Semua pembelian paket Anda, terbaru di atas." />

      {rows.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-fg-muted">Belum ada pesanan.</p>
            <Button asChild className="mt-4 h-10 px-4 text-sm font-semibold">
              <Link href="/plans">Lihat paket</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Paket</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Detail</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="whitespace-nowrap text-fg-muted">{date.format(o.createdAt)}</TableCell>
                  <TableCell className="font-medium text-heading">{planNameOf(o)}</TableCell>
                  <TableCell className="text-right font-mono">{formatIdr(o.amountIdr)}</TableCell>
                  <TableCell>
                    <OrderBadge status={o.status} fulfillment={o.fulfillment} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/orders/${o.id}`} className="text-sm font-medium text-primary-ink underline-offset-4 hover:underline">
                      Detail
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
