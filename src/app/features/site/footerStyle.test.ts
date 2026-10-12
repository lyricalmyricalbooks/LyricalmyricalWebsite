import { describe, it, expect } from "vitest";
import { footerBrandAlign, footerLinksAlign, footerStyleCss } from "./footerStyle";

describe("footer style controls", () => {
  it("uses the footer's own spacing when nothing is set and no colour overrides", () => {
    const css = footerStyleCss({ showFooterAccentLine: false, footerGroupHeadingsAccent: false, showFooterBrandDivider: false, footerSocialBoxes: false });
    expect(css).toContain(".fm-footer-main{padding-top:56px;padding-bottom:56px;}");
    expect(css).toContain(".fm-footer-groups{column-gap:64px;}");
    expect(css).toContain(".fm-footer-list>*+*{margin-top:12px;}");
    expect(css).not.toContain("color:");
    expect(css).not.toContain("border-top-width:0");
  });

  it("applies spacing, colours and divider choices, clamped and sanitised", () => {
    const css = footerStyleCss({ footerPaddingY: 999, footerPaddingYMobile: 20, footerColumnGap: 80, footerLinkGap: 8, footerTextSize: 14,
      footerTextColor: "#eeeeee", footerHeadingColor: "#999999", footerLinkHoverColor: "#ff0", footerDividerColor: "red;}x{", showFooterDividers: false });
    expect(css).toContain("padding-top:160px");
    expect(css).toContain("padding-top:20px");
    expect(css).toContain("column-gap:80px");
    expect(css).toContain("margin-top:8px");
    expect(css).toContain("font-size:14px");
    expect(css).toContain("color:#eeeeee !important");
    expect(css).toContain(".fm-footer-heading{color:#999999 !important;}");
    expect(css).toContain("a:hover");
    expect(css).not.toContain("red;}x{");
    expect(css).toContain("border-top-width:0");
  });

  it("defaults the link groups to the right", () => {
    expect(footerLinksAlign({})).toBe("end");
    expect(footerLinksAlign({ footerLinksAlign: "spread" })).toBe("spread");
    expect(footerLinksAlign({ footerLinksAlign: "bogus" })).toBe("end");
  });

  it("defaults to the E3 look and lets every piece be switched off or recoloured", () => {
    const css = footerStyleCss({});
    expect(css).toContain("border-top:3px solid var(--accent, currentColor)");
    expect(css).toContain(".fm-footer-groups .fm-footer-heading{color:var(--accent, currentColor)");
    expect(css).toContain(".fm-footer-brand{max-width:none");
    expect(css).toContain("border-right:1px solid");
    expect(css).toContain(".fm-footer-icon-box{");
    const off = footerStyleCss({ showFooterAccentLine: false, footerGroupHeadingsAccent: false, footerBrandAlign: "start", showFooterBrandDivider: false, footerSocialBoxes: false });
    expect(off).not.toContain("border-top:3px");
    expect(off).not.toContain(".fm-footer-brand");
    expect(off).not.toContain(".fm-footer-icon-box");
    const custom = footerStyleCss({ footerAccentColor: "#ff6fae", footerAccentLineWidth: 6, footerHeadingColor: "#999" });
    expect(custom).toContain("border-top:6px solid #ff6fae");
    expect(custom).not.toContain(".fm-footer-groups .fm-footer-heading");
    expect(footerBrandAlign({ footerBrandAlign: "bogus" })).toBe("center");
  });

  it("centres the logo on phones, lines it up top on request and colours the square buttons on hover", () => {
    const css = footerStyleCss({});
    expect(css).not.toContain("@media (min-width:768px){[data-fm-footer] .fm-footer-brand{max-width:none");
    expect(css).toContain(".fm-footer-brand{max-width:none");
    expect(css).toContain("justify-content:center;text-align:center");
    expect(css).toContain(".fm-footer-icon-box:hover,[data-fm-footer] .fm-footer-icon-box:focus-visible{border-color:var(--accent, currentColor)");
    const top = footerStyleCss({ footerBrandVAlign: "top", footerBrandCenterMobile: false, footerSocialHoverColor: "#ff6fae" });
    expect(top).toContain("justify-content:flex-start");
    expect(top).toContain("@media (min-width:768px){[data-fm-footer] .fm-footer-brand{max-width:none");
    expect(top).toContain("border-color:#ff6fae !important");
  });
});
