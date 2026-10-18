import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadinessPanel } from "./OverviewParts";

describe("ReadinessPanel", () => {
  it("shows unknown readiness with a retry after a source read fails", () => {
    const html = renderToStaticMarkup(<ReadinessPanel error items={null} onRetry={() => {}} onOpen={() => {}} />);
    expect(html).toContain("Launch checks unavailable");
    expect(html).toContain("Readiness is unknown");
    expect(html).toContain("Try again");
  });
  it("keeps deployment checks actionable through an external link", () => {
    const html = renderToStaticMarkup(<ReadinessPanel error={false} items={[{ id: "deployment", status: "warn", label: "Deployment unverified", detail: "Review release", tab: "general", action: "Check deployments", href: "https://example.com/releases" }]} onRetry={() => {}} onOpen={() => {}} />);
    expect(html).toContain('href="https://example.com/releases"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Check deployments");
  });
});

import { StatRow, BarRow, DrillList } from "./OverviewParts";

describe("drill-down rows", () => {
  it("a row with details is a closed disclosure button; without, a plain line", () => {
    const html = renderToStaticMarkup(<ul><StatRow label="Carts" value={4} details={<p>inside</p>} /><BarRow label="Mon" value={1} share={50} details={<p>x</p>} /><StatRow label="Plain" value={1} /></ul>);
    expect(html.match(/aria-expanded="false"/g)?.length).toBe(2);
    expect(html).not.toContain("inside");
  });
  it("lists the first items, links them, and offers Show all", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ key: String(i), title: `Order ${i}`, href: `#orders/${i}`, value: "CA$1" }));
    const html = renderToStaticMarkup(<DrillList label="Orders" items={items} limit={3} />);
    expect(html.match(/<li/g)?.length).toBe(3);
    expect(html).toContain('href="#orders/0"');
    expect(html).toContain("Show all 10");
    expect(renderToStaticMarkup(<DrillList label="x" items={[]} empty="None here" />)).toContain("None here");
  });
});
