/** Order state as the buyer sees it (Indonesian). Pure, so the server page, the status route and the client share it. */

export type OrderStatus = "pending" | "paid" | "failed" | "expired" | "cancelled" | "refunded";
export type FulfillmentStatus = "queued" | "retrying" | "succeeded" | "dead";
export type OrderTone = "pending" | "success" | "danger" | "muted";

export type OrderStateView = { label: string; detail: string; tone: OrderTone; final: boolean };

/** What happened to the subscription an order granted. */
export type GrantPhase = "active" | "replaced" | "ended";

export type GrantFacts = { endsAt: Date | string; reconciledAt: Date | string | null; replaced: boolean };

/**
 * Phase of a grant at `nowMs`. `replaced` is true when a newer purchase took the plan over (return of
 * the unused quota with a `replace_return` ledger row, or reconciled before its natural end).
 * No grant row: a succeeded fulfillment always writes its grant in the same transaction, so treat it as active.
 */
export function grantPhase(grant: GrantFacts | null | undefined, nowMs: number): GrantPhase {
  if (!grant) return "active";
  if (grant.replaced) return "replaced";
  if (grant.reconciledAt || new Date(grant.endsAt).getTime() <= nowMs) return "ended";
  return "active";
}

export function describeOrder(order: { status: OrderStatus; fulfillment: FulfillmentStatus | null; grantPhase?: GrantPhase | null }): OrderStateView {
  switch (order.status) {
    case "pending":
      return { label: "Menunggu pembayaran", detail: "Selesaikan pembayaran sebelum waktu habis.", tone: "pending", final: false };
    case "paid":
      if (order.fulfillment === "succeeded" && order.grantPhase === "replaced") {
        return { label: "Digantikan paket baru", detail: "Paket ini sudah diganti oleh pembelian paket yang lebih baru.", tone: "muted", final: true };
      }
      if (order.fulfillment === "succeeded" && order.grantPhase === "ended") {
        return { label: "Berakhir", detail: "Masa aktif paket ini sudah selesai. Beli paket lagi bila masih dibutuhkan.", tone: "muted", final: true };
      }
      if (order.fulfillment === "succeeded") {
        return { label: "Paket aktif", detail: "Pembayaran diterima dan kredit sudah masuk. Buka console untuk membuat API key.", tone: "success", final: true };
      }
      if (order.fulfillment === "dead") {
        return { label: "Lunas, aktivasi tertunda", detail: "Pembayaran sudah kami terima, tetapi aktivasi perlu dicek manual. Hubungi dukungan dengan nomor pesanan ini.", tone: "danger", final: true };
      }
      return { label: "Lunas, mengaktifkan paket", detail: "Pembayaran diterima. Paket sedang diaktifkan, biasanya kurang dari satu menit.", tone: "pending", final: false };
    case "expired":
      return { label: "Kedaluwarsa", detail: "Waktu pembayaran habis. Buat pesanan baru bila masih ingin membeli.", tone: "muted", final: true };
    case "cancelled":
      return { label: "Dibatalkan", detail: "Pesanan ini dibatalkan.", tone: "muted", final: true };
    case "failed":
      return { label: "Gagal dibuat", detail: "Tagihan tidak bisa dibuat. Tidak ada pembayaran yang diminta. Coba beli lagi.", tone: "danger", final: true };
    case "refunded":
      return { label: "Dikembalikan", detail: "Pembayaran ini dikembalikan. Hubungi dukungan bila ada pertanyaan.", tone: "muted", final: true };
  }
}

/** One row of GET /api/orders (the buyer's order history). */
export type OrderListItem = {
  id: string;
  createdAt: string;
  planName: string;
  amountIdr: number;
  statusLabel: string;
  tone: OrderTone;
  pending: boolean;
};

/** Seconds left until `expiresAt`, never negative. */
export function secondsLeft(expiresAt: Date | string, nowMs: number): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - nowMs) / 1000));
}

/** 754 -> "12:34". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
