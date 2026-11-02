import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TablePageSkeleton, TableSkeleton } from "./skeletons";

describe("skeletons", () => {
  it("TableSkeleton renders the asked rows and columns, hidden from assistive tech", () => {
    const html = renderToStaticMarkup(createElement(TableSkeleton, { rows: 4, cols: 3 }));
    expect((html.match(/data-slot="skeleton"/g) ?? []).length).toBe(3 + 4 * 3);
    expect(html).toContain('aria-hidden="true"');
  });

  it("a page preset has one busy status and no role-specific text", () => {
    const html = renderToStaticMarkup(createElement(TablePageSkeleton, { filters: true }));
    expect((html.match(/role="status"/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/admin/i);
  });
});
