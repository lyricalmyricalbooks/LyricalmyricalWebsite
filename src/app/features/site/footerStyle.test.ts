import { describe, it, expect } from "vitest";
import { footerLinksAlign, footerStyleCss } from "./footerStyle";

describe("footer style controls", () => {
  it("uses the footer's own spacing when nothing is set and no colour overrides", () => {
    const css = footerStyleCss({});
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
});
