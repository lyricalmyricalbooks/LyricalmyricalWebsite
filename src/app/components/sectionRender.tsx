import { sectionSpacingCss } from "./sectionSpacing";
import { Component, useEffect, type ReactNode } from "react";
import { m } from "motion/react";
import { useNavigate } from "react-router";
import * as Sections from "./SectionComponents";
import { hexToRgbTriplet } from "../features/site/themeTokens";
import { googleFontHref } from "../features/site/fonts";
import { findScheme, schemeList } from "../features/site/colorSchemes";
import { resolveSectionSharedBlocks } from "../features/site/sharedBlocks";
import { UP_TO } from "../features/site/breakpoints";
import { SectionDesignContext, useSectionPage } from "./sectionCopy";
import { HTML_SETTING_KEYS, resolveDynamicSettings } from "../features/site/dynamicSources";
import { sectionsSurface } from "../features/site/templateAlternates";
import { SectionPriorityContext, sectionHasPriority } from "./ResponsiveImage";
import {
  boxShadowValue,
  cornerRadiusValue,
  backdropBlurValue,
  shapeDividerSvgPath,
  HOVER_GLOW_CSS,
} from "./sectionStyleHelpers";

// ─────────────────────────────────────────────────────────────────────────────
// Shared section renderer
//
// This is the single source of truth for turning a `sections` array (from the
// theme editor) into rendered storefront output. It is used by:
//   - MainSite (homepage `heroPage.sections` + `globalSections`)
//   - every standalone page (product/collection/page/cart) via `TemplateSections`
//
// The storefront resolves a section to its component **by name** through
// `(Sections as any)[section.type]` — see docs/THEME_EDITOR.md. A registry type
// with no identically named renderer in SectionComponents.tsx renders nothing.
//
// NOTE: the small font/animation helpers below are intentionally self-contained
// (not imported from MainSite) so standalone pages don't pull in the large
// MainSite module. Keep them in sync if the MainSite typography behavior changes.
// ─────────────────────────────────────────────────────────────────────────────

/** Loads a Google font stylesheet on demand (no-op for the default Inter). */
function GoogleFontLoader({ font }: { font: string }) {
  useEffect(() => {
    if (!font || font === "Inter") return;
    const linkId = `google-font-${font.replace(/\s+/g, "-").toLowerCase()}`;
    if (document.getElementById(linkId)) return;
    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = googleFontHref(font);
    document.head.appendChild(link);
  }, [font]);
  return null;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Per-section publish window: only render between showFrom and showUntil (if set). */
export function sectionInWindow(section: any): boolean {
  const s = section?.settings || {};
  if (s.showFrom && Date.now() < new Date(s.showFrom).getTime()) return false;
  if (s.showUntil && Date.now() > new Date(s.showUntil).getTime()) return false;
  return true;
}

/** Scoped style + font loading for a section's heading/body font overrides. */

function SectionScopedCss({ sectionId, css }: { sectionId: string; css?: string }) {
  if (!css) return null;
  const selector = `[data-fm-section="${sectionId}"]`;
  const scoped = String(css)
    .split("}")
    .map((rule) => {
      const [rawSelectors, body] = rule.split("{");
      if (!rawSelectors || !body) return "";
      const selectors = rawSelectors
        .split(",")
        .map((sel) => {
          const trimmed = sel.trim();
          if (!trimmed) return "";
          return trimmed.includes("&") ? trimmed.replace(/&/g, selector) : `${selector} ${trimmed}`;
        })
        .filter(Boolean)
        .join(", ");
      return selectors ? `${selectors}{${body}}` : "";
    })
    .filter(Boolean)
    .join("\n");
  return scoped ? <style>{scoped}</style> : null;
}

/**
 * Renders an absolutely-positioned shape-divider SVG at the top or bottom
 * edge of a section wrapper. No-op when `style` is unset or "none".
 */
function ShapeDivider({ style, position, color }: { style?: string; position: "top" | "bottom"; color?: string }) {
  if (!style || style === "none") return null;
  const path = shapeDividerSvgPath(style as "slope" | "curve" | "wave", position);
  return (
    <div
      aria-hidden="true"
      className={`absolute left-0 w-full overflow-hidden leading-[0] pointer-events-none ${position === "top" ? "top-0" : "bottom-0"}`}
      style={{ height: "60px", zIndex: 1 }}
    >
      <svg
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        <path d={path} fill={color || "#ffffff"} />
      </svg>
    </div>
  );
}

function SectionFontOverride({ sectionId, settings }: { sectionId: string; settings: any }) {
  const heading = settings?.headingFontOverride;
  const body = settings?.bodyFontOverride;
  if (!heading && !body) return null;
  let css = "";
  if (body) css += `[data-section-id="${sectionId}"]{font-family:'${body}',sans-serif;}`;
  if (heading)
    css += `[data-section-id="${sectionId}"] h1,[data-section-id="${sectionId}"] h2,[data-section-id="${sectionId}"] h3,[data-section-id="${sectionId}"] h4{font-family:'${heading}',sans-serif;}`;
  return (
    <>
      {heading && <GoogleFontLoader font={heading} />}
      {body && <GoogleFontLoader font={body} />}
      <style>{css}</style>
    </>
  );
}

/** Entrance animation wrapper driven by section.settings.animation. */
function SectionReveal({ animation, enableAnimations, children }: any) {
  const mode = animation || (enableAnimations ? "" : "none");
  if (mode === "none" || mode === "" || prefersReducedMotion()) return children;
  const initials: Record<string, any> = {
    "fade-up": { opacity: 0, y: 36 },
    fade: { opacity: 0 },
    "slide-left": { opacity: 0, x: 60 },
    "slide-right": { opacity: 0, x: -60 },
    zoom: { opacity: 0, scale: 0.92 },
  };
  const initial = initials[mode];
  if (!initial) return children;
  return (
    <m.div
      initial={initial}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.9, ease: [0.215, 0.61, 0.355, 1] }}
    >
      {children}
    </m.div>
  );
}

const inStudioPreview = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "true";

/**
 * One section that throws must not blank the whole page. Shoppers see the page without it;
 * the Studio preview shows a placeholder and tells the editor which section failed.
 */
export class SectionBoundary extends Component<{ sectionId: string; type: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error(`Section ${this.props.type} (${this.props.sectionId}) failed to render:`, error);
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ type: "PREVIEW_ERROR", sectionId: this.props.sectionId,
          message: `${this.props.type}: ${String(error?.message || error)}` }, window.location.origin);
      }
    } catch { /* ignore */ }
  }

  componentDidUpdate(previous: Readonly<{ sectionId: string; type: string; children: ReactNode }>) {
    // A new draft for this section gets a fresh chance to render.
    if (this.state.failed && previous.children !== this.props.children) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (!inStudioPreview()) return null;
    return <div role="note" data-section-error={this.props.sectionId}
      style={{ padding: 24, border: "2px dashed currentColor", opacity: 0.7, fontSize: 13 }}>
      {`${this.props.type} could not be displayed. Check its settings in Studio.`}
    </div>;
  }
}

export type SectionListProps = {
  sections?: any[];
  colorSchemes?: any[];
  books?: any[];
  onCtaClick?: () => void;
  onProductClick?: (book: any) => void;
  enableAnimations?: boolean;
  /** Value for the `data-section` attribute (used by the editor's click-to-edit). */
  dataSection?: string;
  sharedBlocks?: any[];
  /** The page design, so renderers can read shopper-facing helper words via getCopy. */
  design?: any;
};

/** Sections from this position on are drawn when shoppers scroll near them (the first screens render at once). */
export const LAZY_FROM_INDEX = 2;
/** Every-page groups stay as they are: they sit in the header, above the footer or in a pop-up. */
const LAZY_EXCLUDED_GROUPS = new Set(["headerSections", "globalSections", "overlaySections"]);
/** Sections with a bar fixed to the screen: content-visibility would pin it inside the section instead. */
const LAZY_EXCLUDED_TYPES = new Set(["StickyAddToBagSection"]);

/**
 * Renders an ordered list of theme sections. Pure (no router/data hooks) so it
 * can be used on any surface. Returns null when there is nothing to render.
 */
export function SectionList({
  sections,
  colorSchemes,
  books = [],
  onCtaClick,
  onProductClick,
  enableAnimations = true,
  dataSection = "homepage",
  sharedBlocks = [],
  design,
}: SectionListProps) {
  const list = (sections || []).filter((section: any) => section.visible !== false && sectionInWindow(section));
  const pageContext = useSectionPage();
  const preview = typeof window !== "undefined" && window.location.search.includes("preview=true");
  // Style › Layout & spacing › "Draw sections lower on the page only when shoppers scroll near them" (Phase 4):
  // sections from the third on use CSS content-visibility, so the browser skips laying them out until they come near
  // the screen. The DOM stays complete (prerendered HTML, search, find-in-page and screen readers see everything).
  // Never in the Studio preview (its tools measure every section) or in the shared header/footer/pop-up groups.
  const lazy = !preview && design?.lazySections !== false && !LAZY_EXCLUDED_GROUPS.has(dataSection);
  if (list.length === 0) return null;
  // The scheme list this stack was given (a page's own, else the design's), else the starter schemes.
  const schemes: any[] = schemeList({ colorSchemes });

  return (
    <SectionDesignContext.Provider value={design || null}>
    <div className="flex flex-col">
      {list.map((section: any, index: number) => {
        const SectionComponent = (Sections as any)[section.type];
        if (!SectionComponent) return null;

        // Connected fields (Studio 2.7 dynamic sources) become plain values for this page; "Hide when empty"
        // leaves the section out where its connected details are missing.
        const dyn = resolveDynamicSettings(resolveSectionSharedBlocks(section.settings || {}, sharedBlocks), pageContext, { preview, htmlKeys: HTML_SETTING_KEYS[section.type] });
        if (dyn.hidden) return null;
        const s = { ...dyn.settings, __sectionId: section.id, __sharedBlocks: sharedBlocks };
        // Style tab › Colour scheme. `data-scheme` picks up the scheme's variables (schemeCss, emitted by
        // StorefrontOverrides); the inline background/text is what every scheme has always painted.
        const scheme: any = findScheme(schemes, s.colorSchemeId);
        const wrapperCls =
          [
            "relative",
            s.fullWidth ? "w-full" : "",
            s.hideOnMobile ? "hidden md:block" : "",
            s.hideOnDesktop ? "block md:hidden" : "",
            // Tablets = 768–1023px, the same range as Studio's tablet preview (features/site/breakpoints.ts).
            s.hideOnTablet ? "md:max-lg:hidden" : "",
            s.customClass || "",
          ]
            .filter(Boolean)
            .join(" ") || undefined;

        const hasGlowHover = s.hoverEffect === "glow";
        const drawLater = lazy && index >= LAZY_FROM_INDEX && !LAZY_EXCLUDED_TYPES.has(section.type);

        return (
          <div
            key={section.id}
            id={`section-${section.id}`}
            data-section={dataSection}
            data-section-id={section.id}
            data-fm-section={section.id}
            data-scheme={scheme?.id || undefined}
            data-draw-later={drawLater || undefined}
            className={wrapperCls}
            style={{
              ...(drawLater && { contentVisibility: "auto", containIntrinsicSize: "auto 600px" }),
              paddingTop: s.paddingTop != null ? `${s.paddingTop}px` : undefined,
              paddingBottom: s.paddingBottom != null ? `${s.paddingBottom}px` : undefined,
              paddingLeft: s.paddingLeft != null ? `${s.paddingLeft}px` : undefined,
              paddingRight: s.paddingRight != null ? `${s.paddingRight}px` : undefined,
              background: scheme?.background || s.sectionBackground || undefined,
              color: scheme?.text || undefined,
              ...(s.lineColor && { "--border-rgb": hexToRgbTriplet(s.lineColor) }),
              ...(s.boxColor && { "--surface": s.boxColor, "--surface-rgb": hexToRgbTriplet(s.boxColor, "10, 10, 10") }),
              ...(s.raisedBoxColor && { "--surface-2": s.raisedBoxColor, "--surface-2-rgb": hexToRgbTriplet(s.raisedBoxColor, "23, 23, 23") }),
              ...(boxShadowValue(s.boxShadow) && { boxShadow: boxShadowValue(s.boxShadow) }),
              ...(cornerRadiusValue(s.cornerRadius) && { borderRadius: cornerRadiusValue(s.cornerRadius), overflow: "hidden" }),
              ...(backdropBlurValue(s.backdropBlur) && { backdropFilter: backdropBlurValue(s.backdropBlur), WebkitBackdropFilter: backdropBlurValue(s.backdropBlur) }),
            }}
          >
            <SectionFontOverride sectionId={section.id} settings={s} />
            <style>{sectionSpacingCss(section.id, s)}</style>
            {(s.mobilePaddingTop != null || s.mobilePaddingBottom != null || s.mobileFontScale != null || s.mobileColumns != null || s.mobileHeadingSize != null) && <style>{`@media${UP_TO.mobile}{${s.mobileHeadingSize != null ? `#section-${section.id} :is(h1,h2){font-size:${Math.max(12, Math.min(120, Number(s.mobileHeadingSize)))}px!important;}` : ""}#section-${section.id}{${s.mobileFontScale != null ? `font-size:${Number(s.mobileFontScale)}%;` : ""}}${s.mobileColumns != null ? `#section-${section.id} .grid{grid-template-columns:repeat(${Math.max(1, Math.min(4, Number(s.mobileColumns)))},minmax(0,1fr))!important;}` : ""}}`}</style>}
            <SectionScopedCss sectionId={section.id} css={s.customCss} />
            {hasGlowHover && <style>{HOVER_GLOW_CSS}</style>}
            <ShapeDivider style={s.shapeDividerTop} position="top" color={s.shapeDividerTopColor} />
            <SectionReveal animation={s.animation} enableAnimations={enableAnimations}>
              <SectionBoundary sectionId={section.id} type={section.type}>
                <SectionPriorityContext.Provider value={sectionHasPriority(dataSection, index)}>
                  <SectionComponent
                    settings={s}
                    books={books}
                    onCtaClick={onCtaClick}
                    onProductClick={onProductClick}
                    enableAnimations={enableAnimations}
                  />
                </SectionPriorityContext.Provider>
              </SectionBoundary>
            </SectionReveal>
            <ShapeDivider style={s.shapeDividerBottom} position="bottom" color={s.shapeDividerBottomColor} />
          </div>
        );
      })}
    </div>
    </SectionDesignContext.Provider>
  );
}

const slugify = (t: string) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Default product-click handler used by standalone pages: navigate to the book. */
function useDefaultSectionHandlers() {
  const navigate = useNavigate();
  return {
    onCtaClick: () => navigate("/"),
    onProductClick: (book: any) => navigate(`/books/${book?.slug || slugify(book?.title)}`),
  };
}

/**
 * Renders the sections authored for a specific page-type template
 * (`design[templateId].sections`, e.g. productPage / collectionPage / page /
 * cartPage / storefront). Safe to drop into any standalone page — renders
 * nothing if that template has no sections.
 */
export function TemplateSections({
  design,
  templateId,
  books = [],
  enableAnimations,
}: {
  design: any;
  templateId: string;
  books?: any[];
  enableAnimations?: boolean;
}) {
  const handlers = useDefaultSectionHandlers();
  // An alternate template (Studio 2.8) without its own section list shows the default template's sections.
  const surface = (design && design[sectionsSurface(design, templateId)]) || {};
  const sections: any[] = surface.sections || [];
  if (sections.length === 0) return null;
  const colorSchemes =
    surface.colorSchemes && surface.colorSchemes.length > 0 ? surface.colorSchemes : design?.colorSchemes;
  return (
    <SectionList
      sections={sections}
      colorSchemes={colorSchemes}
      books={books}
      onCtaClick={handlers.onCtaClick}
      onProductClick={handlers.onProductClick}
      enableAnimations={enableAnimations ?? (design?.enableAnimations ?? true)}
      dataSection={templateId}
      sharedBlocks={design?.sharedBlocks || []}
      design={design}
    />
  );
}

/**
 * A section group (Studio › Page layout › section groups): `globalSections` above the footer,
 * `headerSections` under the header. Group stacks live at the design root, so every page shows the
 * same ones. `onCtaClick`/`onProductClick` are optional — standalone pages get router defaults.
 */
export function GroupSections({
  design,
  group,
  books = [],
  onCtaClick,
  onProductClick,
}: {
  design: any;
  group: "globalSections" | "headerSections" | "overlaySections";
  books?: any[];
  onCtaClick?: () => void;
  onProductClick?: (book: any) => void;
}) {
  const handlers = useDefaultSectionHandlers();
  const sections: any[] = Array.isArray(design?.[group]) ? design[group] : [];
  if (sections.length === 0) return null;
  return (
    <SectionList
      sections={sections}
      colorSchemes={design?.colorSchemes}
      books={books}
      onCtaClick={onCtaClick || handlers.onCtaClick}
      onProductClick={onProductClick || handlers.onProductClick}
      enableAnimations={false}
      dataSection={group}
      sharedBlocks={design?.sharedBlocks || []}
      design={design}
    />
  );
}

/** The sections shown on every page above the footer (`design.globalSections`). */
export function GlobalSections(props: { design: any; books?: any[]; onCtaClick?: () => void; onProductClick?: (book: any) => void }) {
  return <GroupSections {...props} group="globalSections" />;
}
