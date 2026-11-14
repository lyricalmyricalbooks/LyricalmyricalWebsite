import { describe, expect, it } from "vitest";
import { addressKey, packingKey } from "./fulfillment";
import { onlyAddressLeft, orderPill, orderProgress } from "./orderPage";

const order = (patch: any = {}) => {
  const o: any = {
    paymentStatus: "paid",
    status: "paid",
    customer: { name: "Samantha Shantidatt", address: { street: "2150 Burnhamthorpe Rd W", city: "Mississauga", state: "ON", zip: "L5L 1K3", country: "Canada" } },
    items: [{ id: "hound", title: "The Hound", quantity: 1 }],
    operations: {},
    ...patch,
  };
  return o;
};
const reviewed = (o: any) => { o.operations.addressReviewed = addressKey(o); return o; };
const packed = (o: any) => { reviewed(o); o.operations.packed = packingKey(o); return o; };

describe("orderPill: one status in the header", () => {
  it("names the step the order is waiting for", () => {
    expect(orderPill(order()).text).toBe("Check address");
    expect(orderPill(reviewed(order())).text).toBe("Ready to pack");
    expect(orderPill(packed(order())).text).toBe("Ready to ship");
    expect(orderPill(packed(order({ status: "completed", fulfillmentStatus: "shipped" }))).text).toBe("On the way");
    expect(orderPill(packed(order({ fulfillmentStatus: "delivered" }))).text).toBe("Delivered");
  });
  it("says what stopped it", () => {
    expect(orderPill(order({ paymentStatus: "refunded" })).text).toBe("Refunded");
    expect(orderPill(order({ status: "cancelled", paymentStatus: "unpaid" })).text).toBe("Cancelled");
    expect(orderPill(order({ paymentStatus: "pending" })).text).toBe("Waiting on payment");
    const held = reviewed(order()); held.operations.hold = "Waiting on a reply";
    expect(orderPill(held).text).toBe("On hold");
    expect(orderPill(order({ isTest: true })).text).toBe("Test order");
    expect(orderPill(reviewed(order({ customerRequest: { status: "open", type: "cancel" } }))).text).toBe("Needs you");
  });
  it("doesn't call a customer's open request an address check", () => {
    const o = order({ customerRequest: { status: "open", type: "cancel" } });
    expect(onlyAddressLeft(o)).toBe(false);
    expect(orderPill(o).text).toBe("Needs you");
  });
});

describe("orderProgress: three thin parts", () => {
  it("marks done parts and the one happening now", () => {
    expect(orderProgress(order()).map((p) => p.state)).toEqual(["now", "todo", "todo"]);
    expect(orderProgress(reviewed(order())).map((p) => `${p.label}:${p.state}`)).toEqual(["Address checked:done", "Pack:now", "Ship:todo"]);
    expect(orderProgress(packed(order({ status: "completed", fulfillmentStatus: "shipped" }))).map((p) => p.state)).toEqual(["done", "done", "done"]);
  });
  it("shows no current part while the order waits on something else", () => {
    const held = reviewed(order()); held.operations.hold = "Waiting on a reply";
    expect(orderProgress(held).some((p) => p.state === "now")).toBe(false);
  });
  it("skips the address for pickup and hides for orders with nothing to send", () => {
    const pickup = order({ fulfillmentSelection: { method: "pickup" } });
    expect(orderProgress(pickup).map((p) => p.label)).toEqual(["Pack", "Hand over"]);
    expect(orderProgress(order({ paymentStatus: "pending" }))).toEqual([]);
    expect(orderProgress(order({ items: [{ id: "e", title: "Ebook", quantity: 1, digital: true }] }))).toEqual([]);
  });
});
