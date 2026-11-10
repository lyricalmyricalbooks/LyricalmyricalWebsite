import { useEffect, useState } from "react";
import { adminApi } from "./api";
import type { StudioLocation } from "../lib/studioLocation";
import { ErrorState, LoadingState, SecondaryButton, StatusBadge } from "./riso/components";

/** Colour swatches shown on the Design page: the theme's own colours, by the names the owner knows them by. */
export const DESIGN_SWATCHES: Array<{ key: string; label: string }> = [
  { key: "backgroundColor", label: "Page" },
  { key: "textColor", label: "Text" },
  { key: "primaryColor", label: "Accent" },
  { key: "warningColor", label: "Highlight" },
  { key: "secondaryColor", label: "Links" },
];

type PageRow = { id: string; name: string; detail: string; live: boolean; open: StudioLocation };

/** The storefront's pages: the two built-in templates first, then the owner's own pages in menu order. */
export function designPages(pages: any[]): PageRow[] {
  const own = pages.map((p) => ({
    id: p.id,
    name: p.title || p.slug || "Untitled page",
    detail: `/${p.slug || p.id}`,
    live: p.status === "published",
    open: { leftTab: "pages" as const },
  }));
  return [
    { id: "home", name: "Home", detail: "Front page", live: true, open: { templateId: "heroPage", leftTab: "sections" } },
    { id: "book", name: "Book page", detail: "Template", live: true, open: { templateId: "productPage", leftTab: "sections" } },
    ...own,
  ];
}

/**
 * Design: how the storefront looks, at a glance. Every row opens Studio (the page editor) at the right place;
 * nothing is edited here.
 */
export function DesignPage({ settings, onOpenStudio }: { settings: any; onOpenStudio: (at?: StudioLocation) => void }) {
  const [pages, setPages] = useState<any[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => {
    setFailed(false);
    adminApi.getPages().then(setPages).catch(() => setFailed(true));
  };
  useEffect(load, []);
  const design = settings?.draftDesign || settings?.design || {};
  const heading = design.headingFont || "Anton";
  const body = design.bodyFont || design.font || "Archivo";

  return (
    <div className="rp-design-page">
      <section className="rp-card rp-design-pages" aria-labelledby="design-pages">
        <div className="rp-card-head"><h2 id="design-pages" className="rp-card-title">Pages</h2></div>
        {failed ? <ErrorState title="Pages didn't load" onRetry={load} />
          : !pages ? <LoadingState label="Loading pages…" />
          : (
            <ul className="rp-design-list">
              {designPages(pages).map((p) => (
                <li key={p.id}>
                  <button type="button" className="rp-design-row" onClick={() => onOpenStudio(p.open)}>
                    <span className="rp-design-row-name">{p.name}</span>
                    <span className="rp-design-row-detail">{p.detail}</span>
                    <StatusBadge tone={p.live ? "success" : "warning"} glyph={false}>{p.live ? "Live" : "Draft"}</StatusBadge>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>

      <div className="rp-design-side">
        <section className="rp-card" aria-labelledby="design-colours">
          <div className="rp-card-head">
            <h2 id="design-colours" className="rp-card-title">Colours</h2>
            <SecondaryButton onClick={() => onOpenStudio({ leftTab: "style" })}>Edit</SecondaryButton>
          </div>
          <ul className="rp-swatches">
            {DESIGN_SWATCHES.map((s) => {
              const value = String(design[s.key] || "");
              return (
                <li key={s.key}>
                  <span className="rp-swatch" style={{ background: value || "transparent" }} aria-hidden="true" />
                  <span className="rp-swatch-name">{s.label}</span>
                  <span className="rp-swatch-value">{value.startsWith("#") ? value.toUpperCase() : value || "—"}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rp-card" aria-labelledby="design-type">
          <div className="rp-card-head">
            <h2 id="design-type" className="rp-card-title">Type</h2>
            <SecondaryButton onClick={() => onOpenStudio({ leftTab: "style" })}>Edit</SecondaryButton>
          </div>
          <div className="rp-type-specimen">
            <p className="rp-type-sample" style={{ fontFamily: `"${heading}", Impact, sans-serif` }}>Aa Headings</p>
            <p className="rp-type-name">{heading} · titles</p>
            <p className="rp-type-body" style={{ fontFamily: `"${body}", sans-serif` }}>The quick brown fox reads small-press poetry.</p>
            <p className="rp-type-name">{body} · body text</p>
          </div>
        </section>
      </div>
    </div>
  );
}
