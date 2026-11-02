"use client";

import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { TableCard } from "@/components/console/table-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const PAGE_SIZE = 10;

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, basic: sortFn_basic, datetime: sortFn_datetime },
  columnMeta: metaHelper<{ align?: "right"; hideBelow?: HideBelow }>(),
});

/** Viewport widths under which a column is hidden (so a wide table fits without sideways scroll). Full class names so Tailwind sees them. */
const HIDE_BELOW = { xl: "max-xl:hidden", wide: "max-[1359px]:hidden" } as const;
type HideBelow = keyof typeof HIDE_BELOW;

/** Column definitions for `<DataTable>`: `dataColumns<Row>().columns([c.accessor(...), c.display(...)])`. Cells may render any React node. */
export const dataColumns = <T extends RowData>() => createColumnHelper<typeof features, T>();
// The helper yields columns of mixed value types, so the value type is left open (`any` is what `helper.columns()` returns).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataColumn<T extends RowData> = ColumnDef<typeof features, T, any>;

const rowSkeletons = 5;
const hide = (b?: HideBelow) => (b ? HIDE_BELOW[b] : undefined);

/**
 * Table with search, sortable headers and pagination inside a TableCard (it scrolls sideways inside the card).
 * Default: the client owns search, sort and paging over `data`.
 * `manual`: the server already filtered and paged `data` (URL filters, thousands of rows), so there is no search box
 * or pager here; headers still sort the rows of the current page, and the page renders its own pager below.
 * `data` and `columns` must be stable references (module scope, props, or a query result).
 */
export function DataTable<T extends RowData>({
  data,
  columns,
  caption,
  getRowId,
  manual = false,
  isLoading = false,
  error,
  onRetry,
  empty = "Belum ada data.",
  searchLabel = "Cari",
  pageSize = PAGE_SIZE,
  compact = false,
  className,
}: {
  data: T[];
  columns: DataColumn<T>[];
  /** Accessible name of the table (screen readers only). */
  caption: string;
  getRowId?: (row: T) => string;
  manual?: boolean;
  isLoading?: boolean;
  /** Shows the error state instead of the rows. */
  error?: string | null;
  onRetry?: () => void;
  empty?: React.ReactNode;
  searchLabel?: string;
  pageSize?: number;
  /** Tighter cell padding, for tables with many columns. */
  compact?: boolean;
  className?: string;
}) {
  const table = useTable({
    features,
    columns,
    data,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    globalFilterFn: "includesString",
    manualFiltering: manual,
    manualPagination: manual,
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  const columnCount = table.getAllLeafColumns().length;
  const rows = table.getRowModel().rows;
  const total = manual ? data.length : table.getPrePaginatedRowModel().rows.length;
  const { pageIndex } = table.state.pagination;
  const from = total === 0 ? 0 : manual ? 1 : pageIndex * pageSize + 1;
  const to = manual ? total : Math.min(total, (pageIndex + 1) * pageSize);
  const search = typeof table.state.globalFilter === "string" ? table.state.globalFilter : "";
  const showSearch = !manual;
  const showPager = !manual && !error;

  return (
    <div className={cn("space-y-3", className)}>
      {showSearch && (
        <div className="relative max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <Input
            type="search"
            aria-label={searchLabel}
            placeholder={`${searchLabel}...`}
            value={search}
            onChange={(e) => table.setGlobalFilter(e.target.value)}
            className="h-9 bg-background pl-8"
          />
        </div>
      )}

      <TableCard className={cn(compact && "[&_td]:px-2 [&_th]:px-2")}>
        <Table aria-busy={isLoading || undefined}>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const column = header.column;
                  const sorted = column.getIsSorted();
                  const right = column.columnDef.meta?.align === "right";
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={column.getCanSort() ? (sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none") : undefined}
                      className={cn(right && "text-right", hide(column.columnDef.meta?.hideBelow))}
                    >
                      {header.isPlaceholder ? null : column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={column.getToggleSortingHandler()}
                          className={cn(
                            "-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase outline-none hover:text-heading focus-visible:ring-3 focus-visible:ring-ring/50",
                            sorted && "text-heading",
                          )}
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? <ArrowUp aria-hidden className="size-3" /> : sorted === "desc" ? <ArrowDown aria-hidden className="size-3" /> : <ChevronsUpDown aria-hidden className="size-3 opacity-50" />}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: rowSkeletons }, (_, i) => (
                <TableRow key={i} aria-hidden>
                  {Array.from({ length: columnCount }, (_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full min-w-12 bg-line" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="py-8 text-center whitespace-normal">
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                  {onRetry && (
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                      Coba lagi
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="py-8 text-center whitespace-normal text-fg-muted">
                  {search ? `Tidak ada hasil untuk "${search}".` : empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(cell.column.columnDef.meta?.align === "right" && "text-right", hide(cell.column.columnDef.meta?.hideBelow))}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>

      {showPager && !isLoading && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted">
          <p aria-live="polite">
            Menampilkan {from}-{to} dari {total}
          </p>
          {table.getPageCount() > 1 && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                Sebelumnya
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                Berikutnya
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
