import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable, dataColumns } from "./data-table";

type Row = { id: string; name: string; qty: number };
const col = dataColumns<Row>();
const columns = col.columns([
  col.accessor("name", { header: "Nama" }),
  col.accessor("qty", { header: "Jumlah", meta: { align: "right" } }),
  col.display({ id: "actions", header: "Aksi", enableSorting: false, cell: () => "ok" }),
]);
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: String(i), name: `item-${i + 1}`, qty: i }));
const render = (props: Partial<Parameters<typeof DataTable<Row>>[0]> & { n?: number }) =>
  renderToStaticMarkup(createElement(DataTable<Row>, { data: rows(props.n ?? 0), columns, caption: "Contoh", getRowId: (r) => r.id, ...props }));

describe("DataTable", () => {
  it("shows the first page, the summary and the pager", () => {
    const html = render({ n: 25 });
    expect(html).toContain("item-10");
    expect(html).not.toContain("item-11<");
    expect(html).toContain("Menampilkan 1-10 dari 25");
    expect(html).toContain("Berikutnya");
    expect(html).toContain('aria-sort="none"');
  });

  it("only sortable columns get a sort button and aria-sort", () => {
    const html = render({ n: 2 });
    expect((html.match(/aria-sort=/g) ?? []).length).toBe(2);
  });

  it("shows the empty message", () => {
    expect(render({ n: 0, empty: "Belum ada data." })).toContain("Belum ada data.");
  });

  it("shows skeleton rows while loading and hides the summary", () => {
    const html = render({ n: 0, isLoading: true });
    expect(html).toContain('aria-busy="true"');
    expect((html.match(/data-slot="skeleton"/g) ?? []).length).toBe(5 * 3);
    expect(html).not.toContain("Menampilkan");
  });

  it("shows the error with a retry button", () => {
    const html = render({ n: 3, error: "Gagal memuat.", onRetry: () => {} });
    expect(html).toContain("Gagal memuat.");
    expect(html).toContain("Coba lagi");
    expect(html).not.toContain("item-1<");
  });

  it("manual mode renders all given rows, with no search box or pager", () => {
    const html = render({ n: 25, manual: true });
    expect(html).toContain("item-25");
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain("Menampilkan");
  });

  it("hides a column below its breakpoint on header and cells, and compact tightens padding", () => {
    const hidden = dataColumns<Row>().columns([col.accessor("name", { header: "Nama" }), col.accessor("qty", { header: "Jumlah", meta: { hideBelow: "xl" } })]);
    const html = renderToStaticMarkup(createElement(DataTable<Row>, { data: rows(1), columns: hidden, caption: "Contoh", compact: true }));
    expect((html.match(/max-xl:hidden/g) ?? []).length).toBe(2);
    expect(html).toContain("[&amp;_td]:px-2");
    expect(render({ n: 1 })).not.toContain("max-xl:hidden");
  });
});
