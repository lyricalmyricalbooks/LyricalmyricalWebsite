import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import { useSiteData } from "./useSiteData";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { StoreHeader } from "./StoreHeader";
import { StoreFooter } from "./StoreFooter";
import { GlobalSections } from "../../components/sectionRender";
import { prerenderedHtml } from "../../lib/prerenderedPage";
import { useSEO } from "../../lib/seo";
import { artistsDirectoryStructuredData, breadcrumbData } from "../../lib/bookSeo";
import { getCopy } from "./storeCopy";
import { sitePageStyle } from "./PageView";
import { regionProps } from "./storefrontRegions";
import { placeholderImage } from "./constants";
import { gridPhotoSizes, photoSrcSet } from "./photoSources";
import { framingStyle } from "./photoFraming";
import { PhotoToneDefs } from "./PhotoToneDefs";
import { aspectRatioValue } from "./imageAspect";
import { layerDesign } from "./designModel";
import { artistDirectory, type Artist } from "./artistPages.mjs";
import { describedAlt } from "./photoAlt";

const TITLE_SIZES: Record<string, string> = { sm: "text-3xl", md: "text-4xl md:text-5xl", lg: "text-5xl md:text-7xl", xl: "text-6xl md:text-8xl" };
const TEXT_MEASURES: Record<string, string> = { readable: "62ch", comfortable: "75ch", wide: "90ch" };
const clampNum = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) ? undefined : Math.max(min, Math.min(max, n));
};
const GRID_STEPS = [{ from: 0, cols: 2 }, { from: 768, cols: 3 }, { from: 1024, cols: 4 }];
const isStudioPreview = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "true";

/** /artists: index of every photographer and artist published by the shop, linking to their dedicated pages. */
export default function ArtistsDirectoryPage() {
  const { settings, books, pages, loading: siteLoading, fresh, loadError, retry } = useSiteData();
  const design = settings?.design;
  const artists = useMemo(
    () => [...artistDirectory(books).values()].sort((a, b) => a.name.localeCompare(b.name)),
    [books],
  );
  const waiting = !loadError && (siteLoading || !fresh) && artists.length === 0;
  const held = waiting ? prerenderedHtml() : null;
  useEffect(() => { if (isStudioPreview()) window.parent.postMessage({ type: "PREVIEW_READY" }, "*"); }, []);

  const siteBase = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  const pageUrl = new URL("artists", siteBase).href;
  const shopName = getCopy(design, "siteName");
  const firstCover = artists.map(a => a.books.find(b => b.photos?.[0]?.url)?.photos?.[0]).find(Boolean);
  useSEO(waiting ? {
    keep: !!held,
  } : {
    title: getCopy(design, "seoArtistsTitle"),
    description: getCopy(design, "seoArtistsDescription", { shop: shopName }),
    url: pageUrl,
    image: firstCover?.url,
    imageAlt: describedAlt(firstCover?.altText),
    noindex: !waiting && artists.length === 0,
    jsonLd: [
      artistsDirectoryStructuredData({
        name: getCopy(design, "artistsDirectoryTitle"),
        description: getCopy(design, "seoArtistsDescription", { shop: shopName }),
        url: pageUrl,
        siteUrl: siteBase,
        artists: artists.map(a => ({
          name: a.name,
          url: new URL(`artists/${encodeURIComponent(a.slug)}`, siteBase).href,
          image: a.books.find(b => b.photos?.[0]?.url)?.photos?.[0]?.url,
        })),
      }),
      breadcrumbData([
        { name: getCopy(design, "pdpCrumbShop"), url: siteBase },
        { name: getCopy(design, "artistPageCrumbArtists"), url: pageUrl },
      ]),
    ],
  });

  const root = "style:artistLayout|copy:Artist pages|style:customPages|style:colors";
  if (loadError && artists.length === 0) {
    return (
      <div data-fm-store data-studio-target={root} data-studio-label="Artists directory" className="min-h-screen fm-page text-white flex flex-col">
        <StorefrontThemeStyle design={design} />
        <StoreHeader design={design} pages={pages} books={books} />
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <p role="alert">{getCopy(design, "catalogLoadError")}</p>
          <button type="button" onClick={retry} className="fm-btn px-6 py-3 uppercase tracking-[0.3em] text-[10px]" style={{ border: "1px solid currentColor" }}>{getCopy(design, "catalogRetry")}</button>
        </div>
      </div>
    );
  }
  if (waiting) {
    if (held) return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: held }} />;
    return (
      <div data-fm-store data-studio-target={root} data-studio-label="Artists directory" className="min-h-screen fm-page text-white flex flex-col">
        <StorefrontThemeStyle design={design} />
        <StoreHeader design={design} pages={pages} books={books} />
        <p className="flex-1 flex items-center justify-center text-white/40 text-[10px] tracking-[0.4em] uppercase animate-pulse">
          {getCopy(design, "pageLoading")}
        </p>
      </div>
    );
  }

  return (
    <div data-seo-artists="ready" data-fm-store data-studio-target={root} data-studio-label="Artists directory" className="min-h-screen fm-page text-white flex flex-col">
      <StorefrontThemeStyle design={design} />
      <StoreHeader design={design} pages={pages} books={books} />
      <main className="w-full flex-1">
        <ArtistsDirectoryContent design={design} artists={artists} />
      </main>
      <GlobalSections design={design} books={books} />
      <StoreFooter settings={settings} pages={pages} />
    </div>
  );
}

/** Directory body rendered on /artists (exported for unit tests). */
export function ArtistsDirectoryContent({ design, artists }: { design: any; artists: Artist[] }) {
  const look = sitePageStyle(layerDesign(design || {}, design?.page), "");
  const d = layerDesign(design || {}, design?.storefront);
  const headerWidth = look.headerWidth === "full" ? "100%" : look.headerWidth;
  const topSpacing = clampNum(look.topSpacing, 0, 160);
  const ruleWidth = clampNum(look.ruleWidth, 0, 8) ?? 2;
  const ruleSpacing = clampNum(look.ruleSpacing, 0, 96) ?? 32;
  const textWidthPx = clampNum(look.textWidthPx, 0, 2000) || 0;
  const textMax = textWidthPx ? `${textWidthPx}px` : TEXT_MEASURES[look.textMeasure] || TEXT_MEASURES.readable;
  const sizeD = clampNum(look.titleSizePx, 0, 200) || 0;
  const sizeM = clampNum(look.titleSizePxMobile, 0, 120) || sizeD;
  const separator = getCopy(design, "breadcrumbSeparator");
  const aspect = aspectRatioValue(d.imageAspectRatio || "3:4");
  const fit = d.catalogImageFit === "contain" ? "object-contain" : "object-cover";
  const shopName = getCopy(design, "siteName");

  return (
    <div className="mx-auto px-6 pb-20 md:pb-28" style={{ maxWidth: headerWidth, paddingTop: topSpacing ?? 32 }}>
      <nav {...regionProps("artistBreadcrumb")} aria-label={getCopy(design, "breadcrumbAria")}
        className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] tracking-[0.3em] uppercase text-white/50">
        <Link to="/" className="text-inherit hover:text-white transition-colors">{getCopy(design, "pdpCrumbShop")}</Link>
        {separator && <span aria-hidden="true">{separator}</span>}
        <span aria-current="page" className="min-w-0 truncate text-white/80">{getCopy(design, "artistPageCrumbArtists")}</span>
      </nav>

      {(sizeD || sizeM) ? <style>{`${sizeM ? `@media (max-width:767px){[data-artist-title]{font-size:${sizeM}px !important;}}` : ""}${sizeD ? `@media (min-width:768px){[data-artist-title]{font-size:${sizeD}px !important;}}` : ""}`}</style> : null}
      <h1 {...regionProps("artistHeading")} data-artist-title=""
        className={`mt-10 md:mt-14 ${TITLE_SIZES[look.titleSize] || TITLE_SIZES.md} ${look.titleWeight ? "" : "font-black"} tracking-tight leading-[0.95] break-words ${look.titleUppercase === false ? "" : "uppercase"}`}
        style={{
          ...(look.titleUppercase === false ? { textTransform: "none" } : {}),
          ...(look.titleFont ? { fontFamily: `'${String(look.titleFont).replace(/['"\\;{}<>]/g, "")}', var(--heading-font, sans-serif)` } : {}),
          ...(look.titleWeight ? { fontWeight: Number(look.titleWeight) || undefined } : {}),
          ...(look.showRule ? {} : { marginBottom: ruleSpacing }),
        }}>
        {getCopy(design, "artistsDirectoryTitle")}
      </h1>
      {look.showRule && <hr aria-hidden="true" style={{ border: 0, borderTop: `${ruleWidth}px solid ${look.ruleColor || "rgb(var(--fg-rgb, 255, 255, 255))"}`, marginBlock: `${ruleSpacing}px` }} />}

      <p {...regionProps("artistIntro")} className="text-[18px] md:text-[22px] leading-[1.45] tracking-tight font-medium text-white/80" style={{ maxWidth: textMax }}>
        {getCopy(design, "artistsDirectoryIntro", { shop: shopName })}
      </p>

      {artists.length === 0 ? (
        <p className="py-16 text-xs tracking-[0.25em] uppercase text-white/40">{getCopy(design, "artistsDirectoryEmpty")}</p>
      ) : (
        <div {...regionProps("artistBooks")} className="mt-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
          {artists.map((artist) => {
            const photo = artist.books.find(b => b.photos?.[0]?.url)?.photos?.[0];
            return (
              <article key={artist.slug} className="fm-card group relative min-w-0">
                <Link to={`/artists/${artist.slug}`} className="block">
                  <div {...regionProps("artistPhoto")} className="relative fm-surface fm-photo-frame mb-4 overflow-hidden" style={{ aspectRatio: aspect }}>
                    <img
                      loading="lazy"
                      decoding="async"
                      src={photo?.url || placeholderImage(design)}
                      {...photoSrcSet(photo, gridPhotoSizes(GRID_STEPS, { photo, frame: d.imageAspectRatio || "3:4", cover: fit === "object-cover" }))}
                      alt={describedAlt(photo?.altText) || artist.name}
                      className={`w-full h-full ${fit} transition-transform duration-700 ease-out group-hover:scale-[1.03]`}
                      style={framingStyle(photo)}
                    />
                    <PhotoToneDefs photo={photo} />
                  </div>
                  <div data-studio-target="style:products" data-studio-label="Card title & price" className="fm-card-meta space-y-1">
                    <h2 className="fm-card-title text-sm tracking-wider font-medium leading-tight min-w-0 break-words">{artist.name}</h2>
                    <p className="text-[11px] text-white/50 truncate">{artist.books.map(b => b.title).filter(Boolean).join(", ")}</p>
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
