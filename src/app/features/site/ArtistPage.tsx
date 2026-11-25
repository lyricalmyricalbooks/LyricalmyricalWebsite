import { Fragment, useEffect, useMemo, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { useSiteData } from "./useSiteData";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { StoreHeader } from "./StoreHeader";
import { StoreFooter } from "./StoreFooter";
import { StoreChrome } from "./StoreChrome";
import { NotFoundContent } from "./NotFoundPage";
import { GlobalSections } from "../../components/sectionRender";
import { useMissingRedirect } from "./useMissingRedirect";
import { ga4PageNotFound } from "../../lib/ga4";
import { prerenderedHtml } from "../../lib/prerenderedPage";
import { useSEO } from "../../lib/seo";
import { artistStructuredData, breadcrumbData, leadSentences, searchText } from "../../lib/bookSeo";
import { getCopy } from "./storeCopy";
import { sitePageStyle } from "./PageView";
import { regionProps } from "./storefrontRegions";
import { DescriptionText } from "./DescriptionText";
import { descriptionPlainText } from "./descriptionLinks";
import { useCurrency } from "../../CurrencyContext";
import { displayPrice } from "./displayPrice";
import { quickAddChoice } from "./buyable";
import { placeholderImage } from "./constants";
import { gridPhotoSizes, photoSrcSet } from "./photoSources";
import { framingStyle } from "./photoFraming";
import { PhotoToneDefs } from "./PhotoToneDefs";
import { SoldOutBadge, SoldOutVeil } from "./SoldOutBadge";
import { aspectRatioValue } from "./imageAspect";
import { layerDesign } from "./designModel";
import { findArtist, type Artist } from "./artistPages.mjs";

// Same scale as Style › Custom pages (PageContentSection), so an artist page reads like the shop's other pages.
const TITLE_SIZES: Record<string, string> = { sm: "text-3xl", md: "text-4xl md:text-5xl", lg: "text-5xl md:text-7xl", xl: "text-6xl md:text-8xl" };
const BODY_SIZES: Record<string, string> = { sm: "text-[15px]", md: "text-[17px]", lg: "text-[20px]" };
const TEXT_MEASURES: Record<string, string> = { readable: "62ch", comfortable: "75ch", wide: "90ch" };
const clampNum = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) ? undefined : Math.max(min, Math.min(max, n));
};
const GRID_STEPS = [{ from: 0, cols: 2 }, { from: 768, cols: 3 }, { from: 1024, cols: 4 }];
const TITLES_MARK = "\u0000titles\u0000";

/** "A", "A and B", "A, B and C" (the joining word is Text & labels › Artist pages). */
export function joinTitles<T>(items: T[], and: string): (T | string)[] {
  if (items.length < 2) return items;
  const out: (T | string)[] = [];
  items.forEach((item, i) => {
    if (i > 0) out.push(i === items.length - 1 ? ` ${and} ` : ", ");
    out.push(item);
  });
  return out;
}

/** The first line ("Photobooks by … published by …: The Hound."), with each title as a link when `link` is given. */
export function artistIntro(design: any, artist: Pick<Artist, "name" | "books">, link?: (book: any) => ReactNode): (ReactNode | string)[] {
  const titles = artist.books.map(b => (link ? link(b) : String(b.title || "")));
  const parts = joinTitles<ReactNode | string>(titles, getCopy(design, "artistPageListAnd"));
  const line = getCopy(design, "artistPageIntro", { name: artist.name, shop: getCopy(design, "siteName"), titles: TITLES_MARK });
  const [before, ...rest] = line.split(TITLES_MARK);
  return rest.length ? [before, ...parts, rest.join("")] : [line];
}

const isStudioPreview = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "true";
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

/** /artists/<slug>: one photographer, their bio, their own websites and their books (all from the catalog). */
export default function ArtistPage() {
  const { slug } = useParams<{ slug: string }>();
  const { settings, books, pages, loading: siteLoading, fresh, loadError, retry } = useSiteData();
  const design = settings?.design;
  const artist = useMemo(() => findArtist(books, slug), [books, slug]);
  const notFound = !artist && !loadError && !siteLoading && !!fresh;
  // Still loading on the page the visitor landed on: keep its server-rendered copy and head tags, so a crawler that
  // snapshots mid-load never sees an empty "Loading" page (Google's "soft 404").
  const held = !artist && !loadError && (siteLoading || !fresh) ? prerenderedHtml() : null;
  useMissingRedirect(notFound);
  useEffect(() => { if (notFound) ga4PageNotFound(); }, [notFound, slug]);
  useEffect(() => { if (isStudioPreview()) window.parent.postMessage({ type: "PREVIEW_READY" }, "*"); }, []);

  const siteBase = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  const pageUrl = artist ? new URL(`artists/${encodeURIComponent(artist.slug)}`, siteBase).href : "";
  const bookUrl = (book: any) => new URL(`books/${encodeURIComponent(book.slug || book.id)}`, siteBase).href;
  const introText = artist ? artistIntro(design, artist).join("") : "";
  // The bio may hold [name](https://…) links (DescriptionText draws them); search snippets get the words only.
  const bioText = artist ? searchText(descriptionPlainText(artist.bio)) : "";
  useSEO(artist ? {
    title: getCopy(design, "seoArtistTitle", { name: artist.name }),
    description: leadSentences([introText, bioText].filter(Boolean).join(" ")),
    url: pageUrl,
    image: artist.books.find(b => b.photos?.[0]?.url)?.photos?.[0]?.url,
    jsonLd: [
      artistStructuredData({
        name: artist.name, url: pageUrl, description: leadSentences(bioText || introText, 300), links: artist.links,
        books: artist.books.map(b => ({ name: String(b.title || ""), url: bookUrl(b), image: b.photos?.[0]?.url })),
      }),
      breadcrumbData([
        { name: getCopy(design, "pdpCrumbShop"), url: siteBase },
        { name: artist.name, url: pageUrl },
      ]),
    ],
  } : {
    title: notFound ? getCopy(design, "notFoundTitle") : undefined,
    noindex: notFound,
    keep: !!held,
  });

  const root = "style:artistLayout|copy:Artist pages|style:customPages|style:colors";
  if (!artist && loadError) {
    // The read failed: an error with Retry, not a false 404.
    return (
      <div data-fm-store data-studio-target={root} data-studio-label="Artist page" className="min-h-screen fm-page text-white flex flex-col">
        <StorefrontThemeStyle design={design} />
        <StoreHeader design={design} pages={pages} books={books} />
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <p role="alert">{getCopy(design, "catalogLoadError")}</p>
          <button type="button" onClick={retry} className="fm-btn px-6 py-3 uppercase tracking-[0.3em] text-[10px]" style={{ border: "1px solid currentColor" }}>{getCopy(design, "catalogRetry")}</button>
        </div>
      </div>
    );
  }
  if (!artist && (siteLoading || !fresh)) {
    if (held) return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: held }} />;
    return (
      <div data-fm-store data-studio-target={root} data-studio-label="Artist page" className="min-h-screen fm-page text-white flex flex-col">
        <StorefrontThemeStyle design={design} />
        <StoreHeader design={design} pages={pages} books={books} />
        <p className="flex-1 flex items-center justify-center text-white/40 text-[10px] tracking-[0.4em] uppercase animate-pulse">
          {getCopy(design, "pageLoading")}
        </p>
      </div>
    );
  }
  if (!artist) return <StoreChrome surface="page404"><NotFoundContent design={design} books={books} /></StoreChrome>;

  return (
    <div data-seo-artist={artist.slug} data-fm-store data-studio-target={root} data-studio-label="Artist page" className="min-h-screen fm-page text-white flex flex-col">
      <StorefrontThemeStyle design={design} />
      <StoreHeader design={design} pages={pages} books={books} />
      <main className="w-full flex-1">
        <ArtistContent design={design} artist={artist} bookPath={(b) => `/books/${b.slug || b.id}`} />
      </main>
      <GlobalSections design={design} books={books} />
      <StoreFooter settings={settings} pages={pages} />
    </div>
  );
}

/** The page body, without header and footer (rendered on its own by the tests). */
export function ArtistContent({ design, artist, bookPath }: { design: any; artist: Artist; bookPath: (book: any) => string }) {
  const { formatBookPrice } = useCurrency();
  // The heading, rule and text width follow Style › Custom pages; the colours stay the shop's; the cards follow the grid.
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
  const titleLink = (book: any) => <Link key={book.id} to={bookPath(book)} className="text-inherit underline decoration-1 underline-offset-[0.2em] hover:text-[var(--accent)]">{book.title}</Link>;

  return (
    <div className="mx-auto px-6 pb-20 md:pb-28" style={{ maxWidth: headerWidth, paddingTop: topSpacing ?? 32 }}>
      <nav {...regionProps("artistBreadcrumb")} aria-label={getCopy(design, "breadcrumbAria")}
        className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] tracking-[0.3em] uppercase text-white/50">
        <Link to="/" className="text-inherit hover:text-white transition-colors">{getCopy(design, "pdpCrumbShop")}</Link>
        {separator && <span aria-hidden="true">{separator}</span>}
        <span>{getCopy(design, "artistPageCrumbArtists")}</span>
        {separator && <span aria-hidden="true">{separator}</span>}
        <span aria-current="page" className="min-w-0 truncate text-white/80">{artist.name}</span>
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
        {getCopy(design, "artistPageTitle", { name: artist.name })}
      </h1>
      {look.showRule && <hr aria-hidden="true" style={{ border: 0, borderTop: `${ruleWidth}px solid ${look.ruleColor || "rgb(var(--fg-rgb, 255, 255, 255))"}`, marginBlock: `${ruleSpacing}px` }} />}

      <div className={`grid gap-10 ${artist.links.length ? "lg:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] lg:gap-20" : ""}`}>
        <div style={{ maxWidth: textMax }}>
          <p {...regionProps("artistIntro")} className="text-[20px] md:text-[24px] leading-[1.4] tracking-tight font-medium">
            {artistIntro(design, artist, titleLink).map((part, i) => <Fragment key={i}>{part}</Fragment>)}
          </p>
          {artist.bio && (
            <div {...regionProps("artistBio")} className={`mt-8 ${BODY_SIZES[look.bodySize] || BODY_SIZES.md} leading-[1.8] whitespace-pre-line text-white/70`}>
              <DescriptionText text={artist.bio} />
            </div>
          )}
        </div>
        {artist.links.length > 0 && (
          <aside {...regionProps("artistLinks")} className="lg:pt-1.5">
            <h2 className="text-[10px] font-black tracking-[0.4em] uppercase text-white/40 mb-3">{getCopy(design, "artistPageLinksHeading")}</h2>
            <ul className="border-t border-white/10">
              {artist.links.map(link => (
                <li key={link.url} className="border-b border-white/10">
                  <a href={link.url} target="_blank" rel="noopener" className="group flex items-center justify-between gap-4 py-3 text-[13px] tracking-wide text-inherit hover:text-[var(--accent)] transition-colors">
                    <span className="min-w-0 truncate">{hostOf(link.url)}</span>
                    <ArrowUpRight size={14} aria-hidden="true" className="flex-none opacity-60 group-hover:opacity-100" />
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <section className="mt-16 md:mt-24" aria-labelledby="artist-books-heading">
        <div {...regionProps("artistBooksHeading")} className="flex items-center gap-4 mb-8">
          <h2 id="artist-books-heading" className="text-[10px] font-black tracking-[0.5em] uppercase text-white/40">{getCopy(design, "artistPageBooksHeading")}</h2>
          <span className="font-mono text-[10px] text-white/40">{getCopy(design, "artistPageBooksCount", { count: artist.books.length })}</span>
          <div aria-hidden="true" className="flex-1 h-px bg-white/10" />
        </div>
        <div {...regionProps("artistBooks")} data-ga-list="Artist" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
          {artist.books.map(book => {
            const choice = quickAddChoice(book);
            const out = !choice.inStock && !choice.comingSoon;
            const photo = book.photos?.[0];
            return (
              <article key={book.id} className="fm-card group relative min-w-0">
                <Link to={bookPath(book)} className="block">
                  <div {...regionProps("artistPhoto")} className="relative fm-surface fm-photo-frame mb-4 overflow-hidden" style={{ aspectRatio: aspect }}>
                    <img loading="lazy" decoding="async"
                      src={photo?.url || placeholderImage(design)}
                      {...photoSrcSet(photo, gridPhotoSizes(GRID_STEPS, { photo, frame: d.imageAspectRatio || "3:4", cover: fit === "object-cover" }))}
                      alt={book.title}
                      className={`w-full h-full ${fit} transition-transform duration-700 ease-out group-hover:scale-[1.03]`}
                      style={framingStyle(photo)}
                    />
                    <PhotoToneDefs photo={photo} />
                    {choice.comingSoon && <SoldOutBadge design={design} label={getCopy(design, "comingSoonBadge")} />}
                    {out && <><SoldOutVeil design={design} /><SoldOutBadge design={design} label={getCopy(design, "soldOutLabel")} /></>}
                  </div>
                  <div data-studio-target="style:products" data-studio-label="Card title & price" className="fm-card-meta flex items-start justify-between gap-3">
                    <h3 className="fm-card-title text-sm tracking-wider font-medium leading-tight min-w-0 break-words">{book.title}</h3>
                    {displayPrice(book) > 0 && (
                      <span {...regionProps("artistPrice")} translate="no" className="fm-card-price-wrap shrink-0 font-mono tabular-nums">
                        <span className="fm-card-price text-sm font-bold whitespace-nowrap">{formatBookPrice(book)}</span>
                      </span>
                    )}
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
