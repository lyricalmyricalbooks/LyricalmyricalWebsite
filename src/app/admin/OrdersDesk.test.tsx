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
  it("opens on the Ship station: header, numbered queue and the full order page", () => {
    const html = renderToStaticMarkup(<OrdersDesk selectedId="ABC" onSelect={() => {}} />);
    expect(html).toContain("Ship today");
    expect(html).toContain("Labels today");
    expect(html).toContain("Print pick list");
    expect(html).toContain("All orders · completed");
    expect(html).toContain("Not in this queue");
    // The right side is the real order page (Stripe sync, refunds, labels).
    expect(html).toContain('data-order-detail="ABC"');
    expect(html).toContain("Shortcuts:");
  });

  it("remembers the All orders covers page with its Open / Completed / All tabs", () => {
    store.set("orders-desk-layout", "grid");
    const html = renderToStaticMarkup(<OrdersDesk selectedId={null} onSelect={() => {}} />);
    expect(html).toContain("All orders</h2>");
    for (const label of ["Open", "Completed", "All orders", "Export orders", "Covers", "Ship station"]) expect(html).toContain(label);
    expect(html).not.toContain("data-order-detail");
  });
});
