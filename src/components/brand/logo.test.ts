import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BrandInfo } from "@/lib/brand";
import { Logo } from "./logo";

const render = (brand: BrandInfo) => renderToStaticMarkup(createElement(Logo, { brand }));
const custom = { src: "/brand/logo?v=ab12cd34", width: 400, height: 100 };

describe("Logo", () => {
  it("draws the built-in mark and the name when there is no custom logo", () => {
    const html = render({ name: "Acme", hideWordmark: false, logo: null });
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
    expect(html).toContain(">Acme</span>");
    expect(html).toContain('aria-label="Acme, beranda"');
  });

  it("replaces the mark with the uploaded image, sized to a fixed 28px height, and keeps the name", () => {
    const html = render({ name: "Acme", hideWordmark: false, logo: custom });
    expect(html).not.toContain("<svg");
    expect(html).toContain('src="/brand/logo?v=ab12cd34"');
    expect(html).toContain('alt="Acme"');
    expect(html).toContain('height="28"');
    expect(html).toContain('width="112"'); // 400 x 100 scaled to 28px high
    expect(html).toContain(">Acme</span>");
  });

  it("hides the name only when asked and a custom logo exists", () => {
    expect(render({ name: "Acme", hideWordmark: true, logo: custom })).not.toContain(">Acme</span>");
    expect(render({ name: "Acme", hideWordmark: true, logo: null })).toContain(">Acme</span>");
  });

  it("renders the name as text, never as markup", () => {
    const html = render({ name: "<img src=x onerror=alert(1)>", hideWordmark: false, logo: null });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
