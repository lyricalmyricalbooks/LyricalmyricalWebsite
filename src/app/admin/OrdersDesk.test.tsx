import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./OrderDetail", () => ({ OrderDetail: (p: any) => <div data-order-detail={p.orderId} /> }));
vi.mock("./Orders", () => ({ Orders: () => <div>table</div>, refreshOrdersCache: () => new Promise(() => {}), patchOrdersCache: (o: any) => [o], loadOrderSearchCatalog: () => Promise.resolve(null), loadOrderBooks: () => Promise.resolve(null) }));

import { OrdersDesk } from "./OrdersDesk.tsx";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
});

describe("OrdersDesk", () => {
  it("a link to one order opens it full width: no counters, no queue column beside it", () => {
    const html = renderToStaticMarkup(<OrdersDesk selectedId="ABC" onSelect={() => {}} />);
    // The real order page (Stripe sync, refunds, labels) is the whole view.
    expect(html).toContain('data-order-detail="ABC"');
    expect(html).not.toContain('aria-label="Ship station today"');
    expect(html).not.toContain("Labels today");
    expect(html).not.toContain('aria-label="Ship queue"');
    expect(html).not.toContain("Not in this queue");
  });

  it("never opens on the table view", () => {
    const html = renderToStaticMarkup(<OrdersDesk selectedId={null} onSelect={() => {}} />);
    expect(html).not.toContain('class="od-title">Table</h2>');
  });

  it("opens on All orders › Open, newest first, as covers, whatever was picked last time", () => {
    store.set("orders-desk-layout", "desk");
    store.set("orders-grid-tab", "all");
    const html = renderToStaticMarkup(<OrdersDesk selectedId={null} onSelect={() => {}} />);
    // The page title (Orders) comes from the admin shell; the desk adds no second heading.
    expect(html).not.toContain("All orders</h2>");
    expect(html).toContain('data-variant="page"');
    for (const label of ["Open", "Completed", "All orders", "Export orders", "Covers", "Ship station", "Print pick list"]) expect(html).toContain(label);
    expect(html).not.toContain("data-order-detail");
    expect(html).toContain('aria-selected="true" tabindex="0">Open<');
    expect(html).toContain('<option value="newest" selected="">Newest first');
    expect(html).toContain('aria-pressed="true" class="is-on">Covers<');
  });
});
