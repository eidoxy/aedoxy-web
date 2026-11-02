/** Short text for the "Paket" column of the promo table. An empty list means the promo applies to every plan. */
export function summarizePromoPlans(names: string[]): { label: string; all: boolean; names: string[] } {
  return names.length === 0 ? { label: "Semua paket", all: true, names: [] } : { label: `${names.length} paket`, all: false, names };
}
